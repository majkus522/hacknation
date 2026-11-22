import xml.etree.ElementTree as ET
import requests

BASE_URL = (
    "https://mapy.geoportal.gov.pl/wss/service/pub/guest/"
    "MapaGlebowoRolnicza/MapServer/WMSServer"
)

def get_soil_feature(latitude, longitude):
    delta = 0.01
    bbox = (
        f"{latitude - delta},{longitude - delta},"
        f"{latitude + delta},{longitude + delta}"
    )

    params = {
        "service": "WMS",
        "version": "1.3.0",
        "request": "GetFeatureInfo",
        "CRS": "EPSG:4326",
        "BBOX": bbox,
        "WIDTH": 101,
        "HEIGHT": 101,
        "LAYERS": "0",
        "QUERY_LAYERS": "0",
        "STYLES": "",
        "I": 50,
        "J": 50,
        "INFO_FORMAT": "text/xml",
    }

    response = requests.get(BASE_URL, params=params, timeout=30)
    response.raise_for_status()

    root = ET.fromstring(response.content)
    fields = root.find(".//{*}FIELDS")
    if fields is None:
        return {
            "available": False,
            "source": "Geoportal Mapa Glebowo-Rolnicza 1:5000",
            "message": "Brak danych gleby w tym punkcie.",
        }

    attributes = dict(fields.attrib)
    for key, value in list(attributes.items()):
        attributes[key] = None if value in ("Null", "missing", "") else value

    return {
        "available": True,
        "source": "Geoportal Mapa Glebowo-Rolnicza 1:5000",
        "coordinates": {
            "latitude": latitude,
            "longitude": longitude,
        },
        "raw_attributes": attributes,
        "classifications": {
            "agricultural_complex": attributes.get("KOMPLEKS"),
            "soil_type": attributes.get("TYPPODTYP"),
            "parent_material_1": attributes.get("PODLOZE1"),
            "parent_material_2": attributes.get("PODLOZE2"),
            "soil_kind_1": attributes.get("RODZAJGLEBYORGANICZNEJ1"),
            "graininess_1": attributes.get("GATUNEKREDZINY1"),
            "depth_1": attributes.get("MIAZSZOSC1"),
            "skeleton_1": attributes.get("SZKIELETOWOSC1"),
            "additional_info_1": attributes.get("INFORMACJEDODATKOWE1"),
            "flood_prone": attributes.get("TERENZALEWOWY") == "true",
            "notes": attributes.get("UWAGI"),
            "object_id": attributes.get("SYS_ID"),
        },
        "fetched_at_field": attributes.get("WERSJAOBIEKTU"),
    }