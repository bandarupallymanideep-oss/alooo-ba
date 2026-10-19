"""Hardware detection and device selection for SADARAKSHAK.

Determines:
  - CPU model and logical/physical core count
  - Installed physical GPUs (via Windows CIM/WMI)
  - Whether a compatible NVIDIA GPU is physically present
  - Whether PyTorch supports CUDA
  - Whether CUDA is actually operational (via tensor allocation test)
  - Selected inference device (cuda or cpu) and accelerator label (CUDA or CPU)
  - Detailed hardware summary and diagnostic reasons
"""
import os
import platform
import subprocess
import threading
import time
from typing import Dict, Any, List, Optional, Tuple

import psutil
from sadarakshak.logger import logging

_HW_LOCK = threading.Lock()
_CACHED_HARDWARE: Optional[Dict[str, Any]] = None
_LAST_PROBE_TIME = 0.0
_PROBE_CACHE_TTL = 300.0  # Hardware doesn't change frequently (5 minutes)


def detect_cpu() -> Dict[str, Any]:
    """Detect CPU name, logical and physical core count."""
    cpu_name = platform.processor() or "Unknown CPU"
    try:
        if platform.system() == "Windows":
            cmd = ["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_Processor).Name"]
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            if p.returncode == 0 and p.stdout.strip():
                cpu_name = p.stdout.strip().splitlines()[0].strip()
    except Exception as e:
        logging.debug(f"WMI CPU detection failed: {e}")

    logical_cores = psutil.cpu_count(logical=True) or 1
    physical_cores = psutil.cpu_count(logical=False) or logical_cores

    return {
        "name": cpu_name,
        "logicalCores": logical_cores,
        "physicalCores": physical_cores,
        "architecture": platform.machine(),
    }


def detect_physical_gpus() -> List[Dict[str, Any]]:
    """Detect physical GPUs installed in the machine via Windows CIM / WMI."""
    gpu_list = []
    if platform.system() == "Windows":
        try:
            cmd = [
                "powershell", "-NoProfile", "-Command",
                "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterCompatibility, AdapterRAM, DriverVersion, Status, VideoProcessor | ConvertTo-Json"
            ]
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=4)
            if p.returncode == 0 and p.stdout.strip():
                import json
                raw = json.loads(p.stdout.strip())
                items = raw if isinstance(raw, list) else [raw]
                for it in items:
                    name = it.get("Name")
                    if name:
                        name_str = str(name).strip()
                        vram = it.get("AdapterRAM") or 0
                        vram_bytes = int(vram) if isinstance(vram, (int, float)) else 0
                        
                        mfg = str(it.get("AdapterCompatibility") or "").strip()
                        if not mfg or mfg.lower() in ("unknown", ""):
                            if "intel" in name_str.lower():
                                mfg = "Intel Corporation"
                            elif "nvidia" in name_str.lower():
                                mfg = "NVIDIA Corporation"
                            elif "amd" in name_str.lower() or "radeon" in name_str.lower():
                                mfg = "Advanced Micro Devices (AMD)"
                            else:
                                mfg = "Standard Display Adapter"

                        gpu_list.append({
                            "name": name_str,
                            "manufacturer": mfg,
                            "adapterRamBytes": vram_bytes,
                            "adapterRamGb": round(vram_bytes / (1024 ** 3), 2) if vram_bytes > 0 else None,
                            "driverVersion": str(it.get("DriverVersion") or "").strip(),
                            "status": str(it.get("Status") or "OK").strip(),
                            "videoProcessor": str(it.get("VideoProcessor") or "").strip(),
                        })
        except Exception as e:
            logging.debug(f"WMI GPU detection failed: {e}")

    if not gpu_list:
        gpu_list.append({
            "name": "Standard / Integrated Display Adapter",
            "manufacturer": "Unknown",
            "adapterRamBytes": 0,
            "adapterRamGb": None,
            "driverVersion": "N/A",
            "status": "Unknown",
            "videoProcessor": "N/A",
        })

    return gpu_list


def check_cuda_operational() -> Dict[str, Any]:
    """Inspect PyTorch and verify if CUDA is both supported and operational.

    Having a GPU installed does not automatically mean PyTorch can use it.
    We test real tensor allocation to verify drivers, DLLs, and CUDA runtime.
    """
    cuda_status = {
        "torchVersion": None,
        "torchCudaSupported": False,
        "isAvailable": False,
        "isOperational": False,
        "deviceCount": 0,
        "deviceName": None,
        "vramBytes": 0,
        "vramGb": None,
        "cudaVersion": None,
        "failureReason": None,
    }

    try:
        import torch
        cuda_status["torchVersion"] = torch.__version__
        cuda_status["cudaVersion"] = torch.version.cuda

        if not hasattr(torch, "cuda"):
            cuda_status["failureReason"] = "Installed PyTorch package lacks CUDA module."
            return cuda_status

        is_avail = bool(torch.cuda.is_available())
        cuda_status["isAvailable"] = is_avail

        if not is_avail:
            cuda_status["failureReason"] = f"PyTorch build '{torch.__version__}' does not have CUDA enabled or no NVIDIA driver found."
            return cuda_status

        dev_count = torch.cuda.device_count()
        cuda_status["deviceCount"] = dev_count

        if dev_count == 0:
            cuda_status["failureReason"] = "torch.cuda reports 0 available devices."
            return cuda_status

        # Real operational verification: allocate a tiny tensor on device 0
        try:
            dev_name = torch.cuda.get_device_name(0)
            cuda_status["deviceName"] = dev_name
            test_tensor = torch.zeros((1, 1), device="cuda:0")
            del test_tensor
            torch.cuda.empty_cache()

            props = torch.cuda.get_device_properties(0)
            cuda_status["vramBytes"] = props.total_memory
            cuda_status["vramGb"] = round(props.total_memory / (1024 ** 3), 2)
            cuda_status["isOperational"] = True
            cuda_status["torchCudaSupported"] = True
            cuda_status["failureReason"] = None
        except Exception as alloc_err:
            cuda_status["isOperational"] = False
            cuda_status["failureReason"] = f"CUDA operational verification failed: {alloc_err}"
            logging.warning(f"CUDA tensor allocation failed: {alloc_err}")

    except ImportError:
        cuda_status["failureReason"] = "PyTorch is not installed in the current environment."
    except Exception as e:
        cuda_status["failureReason"] = f"Error querying PyTorch CUDA status: {e}"

    return cuda_status


def get_hardware_diagnostics(force_refresh: bool = False) -> Dict[str, Any]:
    """Get complete, verified hardware diagnostic information."""
    global _CACHED_HARDWARE, _LAST_PROBE_TIME

    with _HW_LOCK:
        now = time.time()
        if not force_refresh and _CACHED_HARDWARE is not None and (now - _LAST_PROBE_TIME) < _PROBE_CACHE_TTL:
            return _CACHED_HARDWARE

        cpu_info = detect_cpu()
        gpus = detect_physical_gpus()
        cuda_info = check_cuda_operational()

        # Check if an NVIDIA GPU is physically present
        has_nvidia_hardware = any(
            "nvidia" in g["name"].lower() or "geforce" in g["name"].lower() or "rtx" in g["name"].lower() or "quadro" in g["name"].lower()
            for g in gpus
        )

        primary_gpu = gpus[0] if gpus else {
            "name": "Standard Display Adapter",
            "adapterRamBytes": 0,
            "adapterRamGb": None,
            "driverVersion": "N/A",
            "status": "Unknown",
        }

        # Device selection logic:
        # 1. If CUDA is operational -> GPU (CUDA)
        # 2. Else -> CPU
        if cuda_info["isOperational"]:
            recommended_device = "cuda:0"
            accelerator = "CUDA"
            device_type = "NVIDIA GPU"
            device_label = f"NVIDIA {cuda_info['deviceName']}"
            gpu_status = "OPERATIONAL"
            status_warning = None
        else:
            recommended_device = "cpu"
            accelerator = "CPU"
            device_type = "CPU"
            device_label = cpu_info["name"]
            if has_nvidia_hardware and not cuda_info["isOperational"]:
                gpu_status = "WARNING_FALLBACK"
                status_warning = cuda_info.get("failureReason") or "NVIDIA GPU detected but PyTorch CUDA is not operational."
            else:
                gpu_status = "CPU_ONLY"
                status_warning = None

        _CACHED_HARDWARE = {
            "cpu": cpu_info,
            "gpus": gpus,
            "primaryGpu": primary_gpu,
            "hasNvidiaHardware": has_nvidia_hardware,
            "cuda": cuda_info,
            "selection": {
                "device": recommended_device,
                "accelerator": accelerator,
                "deviceType": device_type,
                "deviceLabel": device_label,
                "gpuStatus": gpu_status,
                "warning": status_warning,
            },
            "timestamp": now,
        }
        _LAST_PROBE_TIME = now
        return _CACHED_HARDWARE


def detect_gpu_status(force_refresh: bool = True) -> Dict[str, Any]:
    """Perform explicit on-demand GPU hardware detection and evaluate YOLO acceleration capability.

    Accurately classifies the detected hardware into one of the required states:
      - 'GPU Acceleration Available'
      - 'GPU Detected — Acceleration Not Supported'
      - 'GPU Detected'
      - 'No GPU Detected'
      - 'Detection Failed'
    """
    try:
        hw = get_hardware_diagnostics(force_refresh=force_refresh)
        gpus = hw.get("gpus", [])
        primary = hw.get("primaryGpu") or (gpus[0] if gpus else None)
        cuda = hw.get("cuda", {})

        # Check if an actual physical GPU was found (not generic display placeholder with 0 RAM)
        has_real_gpu = False
        if primary and primary.get("name"):
            p_name = primary["name"].lower()
            if "standard" not in p_name and "basic display" not in p_name and "vbox" not in p_name:
                has_real_gpu = True
            elif primary.get("adapterRamBytes", 0) > 0:
                has_real_gpu = True

        if not has_real_gpu:
            for g in gpus:
                g_name = g.get("name", "").lower()
                if "standard" not in g_name and "basic display" not in g_name:
                    has_real_gpu = True
                    primary = g
                    break

        if not has_real_gpu:
            return {
                "success": True,
                "result": "No GPU Detected",
                "gpuDetected": False,
                "accelerationSupported": False,
                "accelerationType": "NONE",
                "gpu": None,
                "allGpus": [],
                "cuda": cuda,
                "inferenceDevice": "cpu",
                "message": "No dedicated or discrete GPU detected on the system.",
                "timestamp": time.time(),
            }

        gpu_name = primary.get("name", "Unknown GPU")
        manufacturer = primary.get("manufacturer") or "Unknown Manufacturer"
        vram_bytes = primary.get("adapterRamBytes", 0)
        vram_gb = primary.get("adapterRamGb")
        vram_display = f"{vram_gb} GB" if vram_gb else (f"{round(vram_bytes / (1024 ** 2))} MB" if vram_bytes else "Shared Memory")

        is_intel = "intel" in gpu_name.lower() or "intel" in manufacturer.lower()
        is_nvidia = "nvidia" in gpu_name.lower() or "geforce" in gpu_name.lower() or "rtx" in gpu_name.lower() or "quadro" in gpu_name.lower() or "nvidia" in manufacturer.lower()
        is_amd = "amd" in gpu_name.lower() or "radeon" in gpu_name.lower() or "amd" in manufacturer.lower()

        # Check acceleration capability for YOLO
        if cuda.get("isOperational"):
            result = "GPU Acceleration Available"
            acceleration_supported = True
            accel_type = "CUDA"
            message = f"Detected {gpu_name} ({manufacturer}, {vram_display}) with operational CUDA acceleration."
        else:
            result = "GPU Detected — Acceleration Not Supported"
            acceleration_supported = False
            accel_type = "NONE"
            if is_intel:
                message = f"Detected {gpu_name} ({manufacturer}, {vram_display}). Intel Arc/iGPU hardware does not support CUDA acceleration in this PyTorch runtime. Safe CPU inference is active."
            elif is_nvidia:
                fail_reason = cuda.get("failureReason") or "NVIDIA drivers or PyTorch CUDA runtime missing."
                message = f"Detected {gpu_name} ({manufacturer}, {vram_display}), but CUDA acceleration is not operational ({fail_reason}). Safe CPU inference is active."
            elif is_amd:
                message = f"Detected {gpu_name} ({manufacturer}, {vram_display}). AMD ROCm / DirectML is not enabled in this PyTorch runtime. Safe CPU inference is active."
            else:
                message = f"Detected {gpu_name} ({manufacturer}, {vram_display}). GPU acceleration is not supported for this device. Safe CPU inference is active."

        return {
            "success": True,
            "result": result,
            "gpuDetected": True,
            "accelerationSupported": acceleration_supported,
            "accelerationType": accel_type,
            "gpu": {
                "name": gpu_name,
                "manufacturer": manufacturer,
                "adapterRamBytes": vram_bytes,
                "adapterRamGb": vram_gb,
                "memoryDisplay": vram_display,
                "driverVersion": primary.get("driverVersion", "N/A"),
                "status": primary.get("status", "OK"),
                "isIntel": is_intel,
                "isNvidia": is_nvidia,
                "isAmd": is_amd,
            },
            "allGpus": gpus,
            "cuda": cuda,
            "inferenceDevice": "cuda:0" if acceleration_supported else "cpu",
            "message": message,
            "timestamp": time.time(),
        }

    except Exception as e:
        logging.exception(f"GPU detection error: {e}")
        return {
            "success": False,
            "result": "Detection Failed",
            "gpuDetected": False,
            "accelerationSupported": False,
            "accelerationType": "NONE",
            "gpu": None,
            "error": str(e),
            "message": f"Hardware GPU detection failed: {e}",
            "timestamp": time.time(),
        }
