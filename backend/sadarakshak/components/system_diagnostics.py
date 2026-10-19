"""System and hardware diagnostics for SADARAKSHAK.

Inspects:
  - OS version and architecture
  - CPU model, logical cores, physical cores, real-time usage
  - RAM total, available, percent used
  - GPU name, VRAM, driver version (via Windows CIM/WMI, PyTorch CUDA, or OpenVINO)
  - PyTorch CUDA capability and OpenVINO hardware accelerators (iGPU/NPU)
  - YOLO inference device and real measured latencies
"""
import os
import platform
import subprocess
import time
from typing import Dict, Any, Optional

import psutil
from sadarakshak.components.hardware_detector import get_hardware_diagnostics

_START_TIME = time.time()


def get_static_hardware() -> Dict[str, Any]:
    hw = get_hardware_diagnostics()
    return {
        "os": f"{platform.system()} {platform.release()} ({platform.version()})",
        "platform": platform.platform(),
        "cpuName": hw["cpu"]["name"],
        "logicalCores": hw["cpu"]["logicalCores"],
        "physicalCores": hw["cpu"]["physicalCores"],
        "gpus": hw["gpus"],
        "primaryGpu": hw["primaryGpu"],
        "cuda": {
            "supported": hw["cuda"]["torchCudaSupported"],
            "operational": hw["cuda"]["isOperational"],
            "deviceCount": hw["cuda"]["deviceCount"],
            "deviceName": hw["cuda"]["deviceName"],
            "failureReason": hw["cuda"]["failureReason"],
        },
        "openvinoDevices": [],
    }


def get_diagnostics(model_trainer, sessions_manager) -> Dict[str, Any]:
    """Returns complete diagnostic snapshot combining hardware and real-time inference metrics."""
    hw = get_static_hardware()

    # Dynamic CPU & RAM metrics
    try:
        cpu_usage = round(psutil.cpu_percent(interval=None), 1)
    except Exception:
        cpu_usage = 0.0

    vm = psutil.virtual_memory()
    total_ram_gb = round(vm.total / (1024 ** 3), 2)
    available_ram_gb = round(vm.available / (1024 ** 3), 2)
    used_ram_gb = round(vm.used / (1024 ** 3), 2)

    # Active model state
    engine = getattr(model_trainer, "engine", "pytorch")
    device = str(getattr(model_trainer, "device", "cpu"))
    warmup_ms = round(getattr(model_trainer, "warmup_ms", 0.0), 1)
    class_names = getattr(model_trainer, "class_names", {})

    # Determine user-friendly inference device indicator
    is_gpu = False
    device_label = "CPU - GPU acceleration unavailable"
    if engine == "openvino":
        if "gpu" in device.lower():
            is_gpu = True
            # Find matching GPU name if possible
            gpu_name = hw["primaryGpu"]["name"]
            device_label = f"GPU - {gpu_name} (OpenVINO Accelerated)"
        elif "npu" in device.lower():
            device_label = "NPU - Intel AI Boost (OpenVINO Accelerated)"
        else:
            device_label = "CPU - Intel Optimized (OpenVINO)"
    elif engine == "pytorch":
        if "cuda" in device.lower() and hw["cuda"]["supported"]:
            is_gpu = True
            cname = hw["cuda"]["deviceName"] or hw["primaryGpu"]["name"]
            device_label = f"GPU - NVIDIA {cname} (CUDA)"
        else:
            device_label = "CPU - GPU acceleration unavailable"

    # Aggregated stream and latency statistics
    active_sessions = [s for s in sessions_manager.list() if s.is_active]
    pipeline_lats = []
    delivery_lats = []
    detection_lats = []
    inference_lats = []
    capture_fps_list = []
    inference_fps_list = []
    frame_errors = 0
    reconnect_total = 0

    for s in sessions_manager.list():
        lat = s.latency()
        if lat.get("pipelineMs"):
            pipeline_lats.append(lat["pipelineMs"])
        if lat.get("deliveryMs"):
            delivery_lats.append(lat["deliveryMs"])
        if lat.get("detectionMs"):
            detection_lats.append(lat["detectionMs"])
        if s.inference_ms:
            inference_lats.append(s.inference_ms)
        if s.capture_fps:
            capture_fps_list.append(s.capture_fps)
        if s.inference_fps:
            inference_fps_list.append(s.inference_fps)
        if s.error:
            frame_errors += 1
        reconnect_total += getattr(s, "reconnect_attempts", 0)

    avg_pipeline = round(sum(pipeline_lats) / len(pipeline_lats), 1) if pipeline_lats else None
    avg_delivery = round(sum(delivery_lats) / len(delivery_lats), 1) if delivery_lats else None
    avg_detection = round(sum(detection_lats) / len(detection_lats), 1) if detection_lats else None
    avg_inference = round(sum(inference_lats) / len(inference_lats), 1) if inference_lats else (warmup_ms or None)
    avg_capture_fps = round(sum(capture_fps_list) / len(capture_fps_list), 1) if capture_fps_list else None
    avg_inference_fps = round(sum(inference_fps_list) / len(inference_fps_list), 1) if inference_fps_list else None

    from sadarakshak.components.accident_store import accident_store
    from sadarakshak.constant.application import MODEL_PATH, CONFIDENCE_THRESHOLD, DETECTED_ACCIDENTS_DIR

    return {
        "timestamp": time.time(),
        "system": {
            "os": hw["os"],
            "platform": hw["platform"],
            "cpu": {
                "name": hw["cpuName"],
                "logicalCores": hw["logicalCores"],
                "physicalCores": hw["physicalCores"],
                "usagePercent": cpu_usage,
            },
            "ram": {
                "totalGb": total_ram_gb,
                "availableGb": available_ram_gb,
                "usedGb": used_ram_gb,
                "usagePercent": vm.percent,
            },
            "gpu": {
                "name": hw["primaryGpu"]["name"],
                "vramBytes": hw["primaryGpu"]["adapterRamBytes"],
                "vramGb": round(hw["primaryGpu"]["adapterRamBytes"] / (1024 ** 3), 2) if hw["primaryGpu"]["adapterRamBytes"] else None,
                "driverVersion": hw["primaryGpu"]["driverVersion"],
                "allGpus": hw["gpus"],
                "cuda": hw["cuda"],
                "openvinoDevices": hw["openvinoDevices"],
            }
        },
        "ai": {
            "modelFile": MODEL_PATH.name,
            "engine": engine,
            "device": device,
            "deviceIndicator": f"Inference device: {device_label}",
            "deviceLabel": device_label,
            "isGpuAccelerated": is_gpu,
            "warmupMs": warmup_ms,
            "classesCount": len(class_names),
            "classes": class_names,
            "confidenceThreshold": CONFIDENCE_THRESHOLD,
            "currentInferenceMs": avg_inference,
            "currentInferenceFps": avg_inference_fps,
        },
        "performance": {
            "inferenceLatencyMs": avg_inference,
            "processingLatencyMs": avg_pipeline,
            "deliveryLatencyMs": avg_delivery,
            "detectionLatencyMs": avg_detection,
            "videoProcessingFps": avg_capture_fps,
            "cpuUtilization": cpu_usage,
            "ramUtilization": vm.percent,
            "activeStreams": len(active_sessions),
            "totalSessions": len(sessions_manager.list()),
            "frameErrors": frame_errors,
            "reconnectAttempts": reconnect_total,
        },
        "streamDiagnostics": {
            "activeCount": len(active_sessions),
            "sessions": [s.status() for s in sessions_manager.list()],
        },
        "backend": {
            "status": "online",
            "uptimeSeconds": round(time.time() - _START_TIME, 1),
            "modelLoaded": True,
            "accidentsSaved": len(accident_store.list()),
            "detectedAccidentsDir": str(DETECTED_ACCIDENTS_DIR),
        }
    }
