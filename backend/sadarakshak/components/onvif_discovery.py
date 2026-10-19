"""SADARAKSHAK ONVIF Camera Discovery and Probing Service.

Pure-Python, zero-heavy-dependency implementation of:
1. WS-Discovery (Web Services Dynamic Discovery via UDP multicast on 239.255.255.250:3702
   and local subnet broadcasts).
2. ONVIF SOAP client for:
   - Device Service (GetDeviceInformation, GetCapabilities, GetServices)
   - Media Service (GetProfiles, GetStreamUri)
   - WS-Security UsernameToken authentication (PasswordDigest & PasswordText)
3. Stream verification reusing SADARAKSHAK's OpenCV diagnose_source pipeline.
"""
import base64
import hashlib
import os
import re
import socket
import time
import urllib.parse
import uuid
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import cv2
import requests

from sadarakshak.components.stream_utils import diagnose_source, mask_url
from sadarakshak.logger import logging

WS_MULTICAST_ADDR = "239.255.255.250"
WS_PORT = 3702

# XML Namespaces
NS = {
    "soap": "http://www.w3.org/2003/05/soap-envelope",
    "soap11": "http://schemas.xmlsoap.org/soap/envelope/",
    "wsa": "http://schemas.xmlsoap.org/ws/2004/08/addressing",
    "d": "http://schemas.xmlsoap.org/ws/2005/04/discovery",
    "dn": "http://www.onvif.org/ver10/network/wsdl",
    "tds": "http://www.onvif.org/ver10/device/wsdl",
    "trt": "http://www.onvif.org/ver10/media/wsdl",
    "tt": "http://www.onvif.org/ver10/schema",
    "wsse": "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd",
    "wsu": "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd",
}


def _create_ws_security_header(username: str, password: str, digest_auth: bool = True) -> str:
    """Generate WS-Security UsernameToken XML header."""
    if not username:
        return ""

    created = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    if digest_auth and password is not None:
        raw_nonce = os.urandom(16)
        nonce_b64 = base64.b64encode(raw_nonce).decode("ascii")
        # Digest = Base64( SHA-1( raw_nonce + created_utf8 + password_utf8 ) )
        sha1_hash = hashlib.sha1(raw_nonce + created.encode("utf-8") + password.encode("utf-8")).digest()
        passwd_digest = base64.b64encode(sha1_hash).decode("ascii")
        passwd_xml = f'<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">{passwd_digest}</wsse:Password>'
        nonce_xml = f'<wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">{nonce_b64}</wsse:Nonce>'
    else:
        passwd_xml = f'<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">{password or ""}</wsse:Password>'
        nonce_xml = ""

    return f"""
    <wsse:Security xmlns:wsse="{NS['wsse']}" xmlns:wsu="{NS['wsu']}" soap:mustUnderstand="1">
      <wsse:UsernameToken>
        <wsse:Username>{username}</wsse:Username>
        {passwd_xml}
        {nonce_xml}
        <wsu:Created>{created}</wsu:Created>
      </wsse:UsernameToken>
    </wsse:Security>"""


def _get_local_ip_addresses() -> List[str]:
    """Retrieve non-loopback IPv4 addresses assigned to active network adapters."""
    ips = []
    try:
        # Get hostname and all associated IPs
        host_name = socket.gethostname()
        for ip in socket.gethostbyname_ex(host_name)[2]:
            if not ip.startswith("127.") and ":" not in ip:
                ips.append(ip)
    except Exception:
        pass

    # Quick connect probe to determine default outbound route
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            def_ip = s.getsockname()[0]
            if def_ip not in ips and not def_ip.startswith("127."):
                ips.insert(0, def_ip)
    except Exception:
        pass

    return ips or ["0.0.0.0"]


@dataclass
class DiscoveredCamera:
    ip: str
    port: int
    xaddr: str
    endpoint_urn: str = ""
    name: str = ""
    hardware: str = ""
    location: str = ""
    scopes: List[str] = None
    types: str = ""
    onvif_supported: bool = True

    def to_dict(self) -> Dict:
        d = asdict(self)
        if not d.get("name"):
            d["name"] = f"Camera {self.ip}:{self.port}"
        return d


@dataclass
class OnvifProfile:
    token: str
    name: str
    width: int = 0
    height: int = 0
    fps: int = 0
    encoding: str = "H264"
    stream_uri: str = ""
    masked_stream_uri: str = ""

    def to_dict(self) -> Dict:
        return asdict(self)


class WSDiscoveryService:
    """Sends WS-Discovery Probe multicasts and collects ProbeMatches from cameras."""

    def __init__(self, timeout: float = 3.0):
        self.timeout = timeout

    def discover(self) -> List[DiscoveredCamera]:
        probe_id_1 = str(uuid.uuid4())
        probe_id_2 = str(uuid.uuid4())

        # Probe 1: Standard ONVIF NetworkVideoTransmitter type
        probe_typed = f"""<?xml version="1.0" encoding="utf-8"?>
<Envelope xmlns:dn="{NS['dn']}" xmlns="{NS['soap']}">
  <Header xmlns:wsa="{NS['wsa']}">
    <wsa:MessageID>urn:uuid:{probe_id_1}</wsa:MessageID>
    <wsa:To MUSTUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
    <wsa:Action MUSTUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
  </Header>
  <Body>
    <Probe xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="{NS['d']}">
      <Types>dn:NetworkVideoTransmitter</Types>
    </Probe>
  </Body>
</Envelope>"""

        # Probe 2: Generic Probe (without Type filter for cameras that omit NVT in probe filter)
        probe_generic = f"""<?xml version="1.0" encoding="utf-8"?>
<Envelope xmlns="{NS['soap']}">
  <Header xmlns:wsa="{NS['wsa']}">
    <wsa:MessageID>urn:uuid:{probe_id_2}</wsa:MessageID>
    <wsa:To MUSTUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
    <wsa:Action MUSTUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
  </Header>
  <Body>
    <Probe xmlns="{NS['d']}" />
  </Body>
</Envelope>"""

        raw_responses: List[Tuple[Tuple[str, int], bytes]] = []

        # Create receiving UDP socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.settimeout(0.4)

        try:
            sock.bind(("", 0))
        except Exception as e:
            logging.warning(f"[ONVIF-Discovery] Socket bind warning: {e}")

        # Send multicast & broadcasts across all detected adapter interfaces
        local_ips = _get_local_ip_addresses()
        broadcast_targets = [("255.255.255.255", WS_PORT), (WS_MULTICAST_ADDR, WS_PORT)]
        for lip in local_ips:
            if lip != "0.0.0.0":
                parts = lip.split(".")
                if len(parts) == 4:
                    subnet_bcast = f"{parts[0]}.{parts[1]}.{parts[2]}.255"
                    broadcast_targets.append((subnet_bcast, WS_PORT))

        for target in set(broadcast_targets):
            try:
                sock.sendto(probe_typed.encode("utf-8"), target)
                sock.sendto(probe_generic.encode("utf-8"), target)
            except Exception as e:
                logging.debug(f"[ONVIF-Discovery] Failed to send probe to {target}: {e}")

        start_time = time.time()
        while time.time() - start_time < self.timeout:
            try:
                data, addr = sock.recvfrom(65535)
                raw_responses.append((addr, data))
            except socket.timeout:
                continue
            except Exception as e:
                logging.warning(f"[ONVIF-Discovery] recv error: {e}")
                break

        sock.close()

        # Parse XML responses
        cameras = self._parse_probe_responses(raw_responses)
        logging.info(f"[ONVIF-Discovery] Completed scan: {len(cameras)} device(s) found.")
        return cameras

    def _parse_probe_responses(self, raw_responses: List[Tuple[Tuple[str, int], bytes]]) -> List[DiscoveredCamera]:
        found: Dict[str, DiscoveredCamera] = {}

        for (from_ip, from_port), raw_bytes in raw_responses:
            try:
                xml_text = raw_bytes.decode("utf-8", errors="ignore")
                root = ET.fromstring(xml_text)
            except Exception as e:
                logging.debug(f"[ONVIF-Discovery] XML parse error from {from_ip}: {e}")
                continue

            # Find all ProbeMatch elements across SOAP versions
            matches = root.findall(".//{http://schemas.xmlsoap.org/ws/2005/04/discovery}ProbeMatch")
            if not matches:
                matches = root.findall(".//ProbeMatch")

            for m in matches:
                # Endpoint URN
                ep = m.find(".//{http://schemas.xmlsoap.org/ws/2004/08/addressing}Address")
                if ep is None:
                    ep = m.find(".//Address")
                endpoint_urn = ep.text.strip() if ep is not None and ep.text else ""

                # Types
                types_el = m.find(".//{http://schemas.xmlsoap.org/ws/2005/04/discovery}Types")
                if types_el is None:
                    types_el = m.find(".//Types")
                types_str = types_el.text.strip() if types_el is not None and types_el.text else ""

                # Scopes
                scopes_el = m.find(".//{http://schemas.xmlsoap.org/ws/2005/04/discovery}Scopes")
                if scopes_el is None:
                    scopes_el = m.find(".//Scopes")
                scopes_str = scopes_el.text.strip() if scopes_el is not None and scopes_el.text else ""
                scopes_list = scopes_str.split() if scopes_str else []

                # XAddrs
                xaddrs_el = m.find(".//{http://schemas.xmlsoap.org/ws/2005/04/discovery}XAddrs")
                if xaddrs_el is None:
                    xaddrs_el = m.find(".//XAddrs")
                xaddrs_str = xaddrs_el.text.strip() if xaddrs_el is not None and xaddrs_el.text else ""
                xaddr_list = xaddrs_str.split() if xaddrs_str else []

                # Parse scope attributes: name, hardware, location
                name = ""
                hardware = ""
                location = ""
                for s in scopes_list:
                    s_unquoted = urllib.parse.unquote(s)
                    if "/name/" in s_unquoted:
                        name = s_unquoted.split("/name/", 1)[1]
                    elif "/hardware/" in s_unquoted:
                        hardware = s_unquoted.split("/hardware/", 1)[1]
                    elif "/location/" in s_unquoted:
                        location = s_unquoted.split("/location/", 1)[1]

                # Determine camera IP and port
                primary_xaddr = xaddr_list[0] if xaddr_list else f"http://{from_ip}:{from_port}/onvif/device_service"
                try:
                    parsed_url = urllib.parse.urlsplit(primary_xaddr)
                    cam_ip = parsed_url.hostname or from_ip
                    cam_port = parsed_url.port or (443 if parsed_url.scheme == "https" else 80)
                except Exception:
                    cam_ip = from_ip
                    cam_port = 80

                # Key by IP:port or endpoint URN
                key = endpoint_urn if endpoint_urn else f"{cam_ip}:{cam_port}"

                if key not in found:
                    found[key] = DiscoveredCamera(
                        ip=cam_ip,
                        port=cam_port,
                        xaddr=primary_xaddr,
                        endpoint_urn=endpoint_urn,
                        name=name or f"Camera ({cam_ip})",
                        hardware=hardware,
                        location=location,
                        scopes=scopes_list,
                        types=types_str,
                        onvif_supported=True,
                    )

        return list(found.values())


class OnvifClient:
    """SOAP client for ONVIF Device and Media services."""

    def __init__(self, host: str, port: int = 80, username: str = "", password: str = "", timeout: float = 6.0):
        self.host = host
        self.port = port
        self.username = username.strip() if username else ""
        self.password = password.strip() if password else ""
        self.timeout = timeout
        self.device_xaddr = f"http://{self.host}:{self.port}/onvif/device_service"
        self.media_xaddr = f"http://{self.host}:{self.port}/onvif/media_service"

    def _soap_call(self, url: str, action: str, body_xml: str, digest_auth: bool = True) -> Tuple[bool, int, str]:
        """Execute a SOAP 1.2 request with WS-Security header."""
        header_xml = _create_ws_security_header(self.username, self.password, digest_auth=digest_auth)
        envelope = f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="{NS['soap']}" xmlns:tds="{NS['tds']}" xmlns:trt="{NS['trt']}" xmlns:tt="{NS['tt']}">
  <soap:Header>
    {header_xml}
  </soap:Header>
  <soap:Body>
    {body_xml}
  </soap:Body>
</soap:Envelope>"""

        headers = {
            "Content-Type": "application/soap+xml; charset=utf-8",
            "Action": action,
        }

        try:
            resp = requests.post(url, data=envelope.encode("utf-8"), headers=headers, timeout=self.timeout)
            return (resp.status_code == 200, resp.status_code, resp.text)
        except Exception as e:
            return (False, 0, str(e))

    def get_device_information(self) -> Dict:
        """Query camera hardware and firmware details."""
        body = f'<tds:GetDeviceInformation xmlns:tds="{NS['tds']}" />'
        ok, status, text = self._soap_call(self.device_xaddr, f"{NS['tds']}/GetDeviceInformation", body)

        # Retry with cleartext password if camera rejected digest
        if not ok and self.username and status in (400, 401, 500):
            ok, status, text = self._soap_call(self.device_xaddr, f"{NS['tds']}/GetDeviceInformation", body, digest_auth=False)

        info = {
            "success": ok,
            "status_code": status,
            "manufacturer": "Unknown",
            "model": "Unknown",
            "firmware": "Unknown",
            "serial": "Unknown",
            "hardware_id": "Unknown",
            "auth_required": False,
            "auth_valid": True,
        }

        if status == 401 or "Unauthorized" in text or "FailedAuthentication" in text or "Sender/Security" in text:
            info["auth_required"] = True
            info["auth_valid"] = False
            info["error"] = "Authentication failed: invalid username or password."
            return info

        if not ok:
            info["error"] = f"Device service query failed (HTTP {status})."
            return info

        try:
            root = ET.fromstring(text)
            for field in ["Manufacturer", "Model", "FirmwareVersion", "SerialNumber", "HardwareId"]:
                el = root.find(f".//{{{NS['tds']}}}{field}")
                if el is None:
                    el = root.find(f".//{field}")
                if el is not None and el.text:
                    key = "firmware" if field == "FirmwareVersion" else ("serial" if field == "SerialNumber" else field.lower())
                    info[key] = el.text.strip()
        except Exception as e:
            info["error"] = f"Failed to parse device information XML: {e}"

        return info

    def get_media_endpoint(self) -> str:
        """Retrieve Media service URL via GetCapabilities or GetServices."""
        body = f'<tds:GetCapabilities xmlns:tds="{NS['tds']}"><tds:Category>Media</tds:Category></tds:GetCapabilities>'
        ok, _, text = self._soap_call(self.device_xaddr, f"{NS['tds']}/GetCapabilities", body)
        if ok:
            try:
                root = ET.fromstring(text)
                xaddr_el = root.find(".//{http://www.onvif.org/ver10/schema}XAddr")
                if xaddr_el is None:
                    xaddr_el = root.find(".//XAddr")
                if xaddr_el is not None and xaddr_el.text:
                    url = xaddr_el.text.strip()
                    # Ensure IP/host matches if camera returned internal/different LAN IP
                    p = urllib.parse.urlsplit(url)
                    return urllib.parse.urlunsplit((p.scheme, f"{self.host}:{p.port or self.port}", p.path, p.query, p.fragment))
            except Exception:
                pass
        return self.media_xaddr

    def get_profiles(self, media_url: Optional[str] = None) -> List[Dict]:
        """Fetch all video media profiles supported by the camera."""
        url = media_url or self.media_xaddr
        body = f'<trt:GetProfiles xmlns:trt="{NS['trt']}" />'
        ok, status, text = self._soap_call(url, f"{NS['trt']}/GetProfiles", body)

        if not ok and self.username and status in (400, 401, 500):
            ok, status, text = self._soap_call(url, f"{NS['trt']}/GetProfiles", body, digest_auth=False)

        if not ok:
            logging.warning(f"[ONVIF-Client] GetProfiles failed for {self.host}:{self.port}: status={status}")
            return []

        profiles = []
        try:
            root = ET.fromstring(text)
            # Find all profile elements regardless of namespace
            profile_els = [el for el in root.iter() if el.tag.endswith("Profiles") or el.tag.endswith("Profile")]

            for p in profile_els:
                token = p.attrib.get("token") or p.attrib.get("fixedToken") or ""
                name_el = next((el for el in p.iter() if el.tag.endswith("Name")), None)
                name = name_el.text.strip() if name_el is not None and name_el.text else token

                # Video encoder configuration
                width = 0
                height = 0
                fps = 0
                encoding = "H264"

                res_el = next((el for el in p.iter() if el.tag.endswith("Resolution")), None)
                if res_el is not None:
                    w = next((el for el in res_el.iter() if el.tag.endswith("Width")), None)
                    h = next((el for el in res_el.iter() if el.tag.endswith("Height")), None)
                    if w is not None and w.text:
                        try:
                            width = int(w.text)
                        except ValueError:
                            pass
                    if h is not None and h.text:
                        try:
                            height = int(h.text)
                        except ValueError:
                            pass

                rate_el = next((el for el in p.iter() if el.tag.endswith("FrameRateLimit")), None)
                if rate_el is not None and rate_el.text:
                    try:
                        fps = int(float(rate_el.text))
                    except ValueError:
                        pass

                enc_el = next((el for el in p.iter() if el.tag.endswith("Encoding")), None)
                if enc_el is not None and enc_el.text:
                    encoding = enc_el.text.strip()

                profiles.append({
                    "token": token,
                    "name": name,
                    "width": width,
                    "height": height,
                    "resolution": f"{width}x{height}" if width and height else "Auto",
                    "fps": fps,
                    "encoding": encoding,
                })
        except Exception as e:
            logging.warning(f"[ONVIF-Client] Failed parsing profiles: {e}")

        return profiles

    def get_stream_uri(self, profile_token: str, media_url: Optional[str] = None) -> Optional[str]:
        """Request RTSP stream URI for a given media profile token."""
        url = media_url or self.media_xaddr
        body = f"""<trt:GetStreamUri xmlns:trt="{NS['trt']}" xmlns:tt="{NS['tt']}">
  <trt:StreamSetup>
    <tt:Stream>RTP-Unicast</tt:Stream>
    <tt:Transport>
      <tt:Protocol>RTSP</tt:Protocol>
    </tt:Transport>
  </trt:StreamSetup>
  <trt:ProfileToken>{profile_token}</trt:ProfileToken>
</trt:GetStreamUri>"""

        ok, status, text = self._soap_call(url, f"{NS['trt']}/GetStreamUri", body)
        if not ok and self.username and status in (400, 401, 500):
            ok, status, text = self._soap_call(url, f"{NS['trt']}/GetStreamUri", body, digest_auth=False)

        if not ok:
            return None

        try:
            root = ET.fromstring(text)
            uri_el = root.find(".//{http://www.onvif.org/ver10/schema}Uri")
            if uri_el is None:
                uri_el = root.find(".//Uri")
            if uri_el is not None and uri_el.text:
                rtsp_uri = uri_el.text.strip()

                # Correct camera IP if camera returned internal/local IP behind NAT
                parsed = urllib.parse.urlsplit(rtsp_uri)
                if parsed.hostname and parsed.hostname != self.host:
                    netloc = f"{self.host}:{parsed.port}" if parsed.port else self.host
                    rtsp_uri = urllib.parse.urlunsplit((parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment))

                # Inject credentials for OpenCV/FFmpeg capture if provided
                if self.username:
                    p = urllib.parse.urlsplit(rtsp_uri)
                    safe_user = urllib.parse.quote(self.username)
                    safe_pwd = urllib.parse.quote(self.password or "")
                    auth_netloc = f"{safe_user}:{safe_pwd}@{p.hostname}"
                    if p.port:
                        auth_netloc += f":{p.port}"
                    rtsp_uri = urllib.parse.urlunsplit((p.scheme, auth_netloc, p.path, p.query, p.fragment))

                return rtsp_uri
        except Exception as e:
            logging.warning(f"[ONVIF-Client] Failed parsing stream URI: {e}")

        return None

    def probe(self) -> Dict:
        """Full diagnostic probe: device information, profiles, and stream URIs."""
        device_info = self.get_device_information()
        if device_info.get("auth_required") and not device_info.get("auth_valid"):
            return {
                "success": False,
                "auth_required": True,
                "auth_valid": False,
                "message": device_info.get("error", "Camera authentication required."),
                "device": device_info,
                "profiles": [],
            }

        media_url = self.get_media_endpoint()
        raw_profiles = self.get_profiles(media_url)

        enriched_profiles = []
        for p in raw_profiles:
            token = p["token"]
            stream_uri = self.get_stream_uri(token, media_url)
            p["streamUri"] = stream_uri or ""
            p["maskedStreamUri"] = mask_url(stream_uri) if stream_uri else ""
            enriched_profiles.append(p)

        # Fallback stream URI if GetStreamUri was not returned (common standard RTSP paths)
        if not any(p.get("streamUri") for p in enriched_profiles):
            fallback_path = f"rtsp://{self.host}:554/live/ch0"
            if self.username:
                fallback_path = f"rtsp://{urllib.parse.quote(self.username)}:{urllib.parse.quote(self.password)}@{self.host}:554/live/ch0"
            enriched_profiles.append({
                "token": "default_fallback",
                "name": "Standard RTSP Stream (Auto-detected)",
                "width": 1920,
                "height": 1080,
                "resolution": "1920x1080 (Estimated)",
                "fps": 25,
                "encoding": "H264",
                "streamUri": fallback_path,
                "maskedStreamUri": mask_url(fallback_path),
            })

        return {
            "success": True,
            "auth_required": device_info.get("auth_required", False),
            "auth_valid": True,
            "device": device_info,
            "profiles": enriched_profiles,
        }


def test_onvif_stream(stream_uri: str) -> Dict:
    """Test video ingestion from a discovered stream URI and generate preview thumbnail."""
    result, frame = diagnose_source(stream_uri, allow_any_path=True)

    thumbnail_b64 = None
    if frame is not None:
        try:
            h, w = frame.shape[:2]
            target_w = 480
            thumb = cv2.resize(frame, (target_w, int(h * target_w / w))) if w > target_w else frame
            ok, buf = cv2.imencode(".jpg", thumb, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if ok:
                thumbnail_b64 = f"data:image/jpeg;base64,{base64.b64encode(buf.tobytes()).decode('ascii')}"
        except Exception as e:
            logging.debug(f"[ONVIF-StreamTest] Thumbnail encode error: {e}")

    result["thumbnail"] = thumbnail_b64
    result["maskedUri"] = mask_url(stream_uri)
    return result
