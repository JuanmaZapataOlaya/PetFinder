# Fallback semantico con TurboVec

Servicio local para almacenar y consultar los embeddings de `pet_tickets` cuando la busqueda semantica de Supabase no esta disponible. El servicio puede recibir vectores ya generados o generar el vector de consulta mediante Portkey, actualmente con `text-embedding-3-small` y 1536 dimensiones.

## Instalacion y ejecucion

```sh
cd turbovec-fallback
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8001 --reload
```

El indice se guarda en `data/pet_tickets.tvim`. Se puede cambiar con `TURBOVEC_INDEX_PATH`; la dimension y el nivel de cuantizacion se pueden cambiar con `VECTOR_DIMENSION` y `TURBOVEC_BIT_WIDTH` antes de iniciar el servicio.

Configura `TURBOVEC_SYNC_TOKEN` con un secreto largo y aleatorio. Cuando esta variable existe, `/add` y `/search` requieren el header `x-turbovec-token`. Configura el mismo secreto en los secrets de Supabase junto con `TURBOVEC_URL`, usando la URL publica del tunnel de Cloudflare.

Configura tambien `PORTKEY_API_KEY` y `PORTKEY_BASE_URL` en `.env`. El servicio carga ese archivo automaticamente al iniciar; las variables exportadas en el entorno tienen prioridad. La ruta `/search` es publica para que el frontend pueda usarla cuando Supabase no responde; `/add` sigue protegido por `TURBOVEC_SYNC_TOKEN`.

```sh
cp .env.example .env
uvicorn app:app --host 127.0.0.1 --port 8001 --reload
```

Para restringir las llamadas del navegador, configura `TURBOVEC_ALLOWED_ORIGINS` como una lista separada por comas de origenes permitidos. Por defecto acepta cualquier origen para facilitar las pruebas locales.

En el proyecto Supabase puedes configurar estos valores con:

```sh
supabase secrets set TURBOVEC_URL=https://tu-dominio-del-tunnel.example.com TURBOVEC_SYNC_TOKEN=tu-secreto-largo
```

Despues de cambiar el tunnel o los secrets, vuelve a desplegar `embed-mascota` y `search-pets`.

## Reindexar tickets existentes

El trigger solo sincroniza tickets nuevos o actualizados. Para cargar los tickets que ya existian, configura en `.env` `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TURBOVEC_URL` y `TURBOVEC_SYNC_TOKEN`, y ejecuta:

```sh
python reindex.py
```

El script lee todos los tickets que ya tienen `description_embedding`, conserva su metadata y usa el endpoint `/add` en modo upsert. Reintenta automáticamente errores transitorios `502`, `503`, `504` y fallos de conexión. El tamaño predeterminado es 25 para funcionar mejor a través de Cloudflare Tunnel; puedes cambiarlo con `REINDEX_BATCH_SIZE=10 python reindex.py`. La service-role key solo debe existir en el entorno administrativo del script.

## API

### Agregar vectores

`POST http://127.0.0.1:8001/add`

```json
{
  "vectors": [
    {"id": 123, "vector": [0.01, 0.02, 0.03]}
  ]
}
```

El ejemplo abreviado no es valido: cada vector debe contener exactamente 1536 valores. Los IDs deben ser enteros no negativos y no se pueden repetir. En caso de necesitar reindexar un reporte, elimina el indice y vuelve a cargar el lote completo.

### Buscar vecinos

`POST http://127.0.0.1:8001/search`

```json
{"query": "perro blanco perdido", "limit": 10}
```

La respuesta contiene los reportes sincronizados, IDs estables y el score de similitud de TurboVec. Los reportes existentes deben reindexarse para incluir metadata local.

```json
{
  "results": [{"id": 123, "score": 0.91}]
}
```

Los ejemplos de vectores estan abreviados para facilitar la lectura; cada vector real debe contener 1536 valores.

Consulta `GET /health` para comprobar que el servicio esta levantado y cuantos vectores tiene cargados.