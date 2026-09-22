import json
import os
import time
from urllib.error import HTTPError, URLError
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def load_dotenv() -> None:
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return

    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


def required_env(*names: str) -> str:
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    names_text = " o ".join(names)
    raise RuntimeError(f"Falta configurar {names_text}. Copia .env.example a .env y completa sus valores.")


load_dotenv()


BATCH_SIZE = int(os.getenv("REINDEX_BATCH_SIZE", "25"))
SUPABASE_URL = required_env("SUPABASE_URL", "SUPABASE_BASE_URL").rstrip("/")
SUPABASE_KEY = required_env("SUPABASE_SERVICE_ROLE_KEY", "SECRET_KEY")
TURBOVEC_URL = required_env("TURBOVEC_URL").rstrip("/")
TURBOVEC_TOKEN = required_env("TURBOVEC_SYNC_TOKEN")

FIELDS = (
    "id,owner_id,name,type,kind,status,location,latitude,longitude,image,"
    "color,breed,note,match_score,reported_at,created_at,updated_at,description_embedding"
)
METADATA_FIELDS = {
    "id",
    "owner_id",
    "name",
    "type",
    "kind",
    "status",
    "location",
    "latitude",
    "longitude",
    "image",
    "color",
    "breed",
    "note",
    "match_score",
    "reported_at",
    "created_at",
    "updated_at",
}


def request_json(url: str, *, headers: dict[str, str], method: str = "GET", body: Any = None) -> Any:
    encoded_body = None if body is None else json.dumps(body).encode()
    for attempt in range(1, 4):
        request = Request(url, headers=headers, method=method, data=encoded_body)
        try:
            with urlopen(request, timeout=120) as response:
                return json.loads(response.read())
        except HTTPError as error:
            response_body = error.read().decode("utf-8", errors="replace")
            if error.code not in {502, 503, 504} or attempt == 3:
                raise RuntimeError(
                    f"Error HTTP {error.code} en {url}: {response_body[:500]}"
                ) from error
            print(f"TurboVec no disponible ({error.code}); reintento {attempt}/3...")
        except URLError as error:
            if attempt == 3:
                raise RuntimeError(f"No se pudo conectar con {url}: {error.reason}") from error
            print(f"Error de conexión con {url}; reintento {attempt}/3...")
        time.sleep(attempt * 2)


def parse_embedding(value: Any) -> list[float] | None:
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, list) or not value:
        return None
    return [float(item) for item in value]


def fetch_batch(offset: int) -> list[dict[str, Any]]:
    query = urlencode({
        "select": FIELDS,
        "description_embedding": "not.is.null",
        "order": "id.asc",
        "limit": BATCH_SIZE,
        "offset": offset,
    })
    return request_json(
        f"{SUPABASE_URL}/rest/v1/pet_tickets?{query}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        },
    )


def send_batch(rows: list[dict[str, Any]]) -> dict[str, Any]:
    vectors = []
    for row in rows:
        embedding = parse_embedding(row.get("description_embedding"))
        if embedding is None:
            print(f"Omitiendo ticket {row.get('id')}: embedding inválido")
            continue
        vectors.append({
            "id": row["id"],
            "vector": embedding,
            "metadata": {key: row.get(key) for key in METADATA_FIELDS},
        })

    if not vectors:
        return {"added": 0, "updated": 0, "total": 0}

    return request_json(
        f"{TURBOVEC_URL}/add",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-turbovec-token": TURBOVEC_TOKEN,
        },
        body={"vectors": vectors},
    )


def main() -> None:
    offset = 0
    processed = 0
    added = 0
    updated = 0

    while True:
        rows = fetch_batch(offset)
        if not rows:
            break
        result = send_batch(rows)
        processed += len(rows)
        added += int(result.get("added", 0))
        updated += int(result.get("updated", 0))
        print(f"Procesados: {processed} | nuevos: {added} | actualizados: {updated}")
        if len(rows) < BATCH_SIZE:
            break
        offset += len(rows)

    print(f"Reindexación terminada. Tickets procesados: {processed}; total TurboVec: {added + updated}")


if __name__ == "__main__":
    main()
