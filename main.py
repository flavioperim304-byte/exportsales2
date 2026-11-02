from io import BytesIO
from os import getenv
from pathlib import Path
from typing import Any, Optional
import hashlib
import re

import chromadb
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from llama_index.core import Document, StorageContext
from llama_index.vector_stores.chroma import ChromaVectorStore

CHROMA_PATH = Path(getenv("CHROMA_PATH", Path(__file__).resolve().parent / "chroma_data"))
COLLECTION_NAME = "dashboard_leads"

app = FastAPI()

# Also kept in memory for this process. Chroma on disk is the source of truth.
pending_documents: list[Document] = []
_chroma_client: Optional[Any] = None


def row_to_text(row: pd.Series) -> str:
    lines: list[str] = []
    for column, value in row.items():
        if pd.isna(value):
            continue
        text = str(value).strip()
        if not text:
            continue
        lines.append(f"{column}: {text}")
    return "\n".join(lines)


def rows_to_documents(frame: pd.DataFrame) -> list[Document]:
    documents: list[Document] = []
    for position, record in enumerate(frame.to_dict(orient="records"), start=1):
        series = pd.Series(record)
        text = row_to_text(series)
        if not text:
            continue
        documents.append(
            Document(
                text=text,
                metadata={
                    "company": str(series.get("Company", "") or ""),
                    "country": str(series.get("Country", "") or ""),
                    "source_row": position,
                    "source": "dashboard-csv",
                },
            )
        )
    return documents


def chroma_path() -> Path:
    CHROMA_PATH.mkdir(parents=True, exist_ok=True)
    return CHROMA_PATH


def chroma_client() -> Any:
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=str(chroma_path()))
    return _chroma_client


def chroma_collection():
    return chroma_client().get_or_create_collection(name=COLLECTION_NAME)


def document_id(doc: Document) -> str:
    company = re.sub(r"[^a-z0-9]+", "-", str(doc.metadata.get("company") or "empresa").lower()).strip("-")
    country = re.sub(r"[^a-z0-9]+", "-", str(doc.metadata.get("country") or "pais").lower()).strip("-")
    digest = hashlib.sha1(doc.text.encode("utf-8")).hexdigest()[:12]
    return f"{company or 'empresa'}-{country or 'pais'}-{digest}"


def persist_documents(documents: list[Document]) -> int:
    """Write LlamaIndex documents to a persistent Chroma collection and keep a VectorStoreIndex ready."""
    if not documents:
        return chroma_collection().count()
    collection = chroma_collection()
    ids = [document_id(doc) for doc in documents]
    texts = [doc.text for doc in documents]
    metas = []
    for doc in documents:
        metas.append(
            {
                "company": str(doc.metadata.get("company") or ""),
                "country": str(doc.metadata.get("country") or ""),
                "source_row": str(doc.metadata.get("source_row") or ""),
                "source": str(doc.metadata.get("source") or "dashboard-csv"),
            }
        )
    collection.upsert(ids=ids, documents=texts, metadatas=metas)
    vector_store = ChromaVectorStore(chroma_collection=collection)
    StorageContext.from_defaults(vector_store=vector_store)
    return collection.count()


def prepare_for_index(documents: list[Document]) -> list[Document]:
    pending_documents.extend(documents)
    persist_documents(documents)
    return documents


def looks_like_csv(name: str, raw: bytes) -> bool:
    lowered = name.lower()
    if lowered.endswith(".csv") or lowered.endswith(".csv.txt"):
        return True
    head = raw.lstrip(b"\xef\xbb\xbf")[:200].decode("utf-8", errors="ignore")
    return "company" in head.lower() and "," in head


def read_dashboard_csv(raw: bytes) -> pd.DataFrame:
    return pd.read_csv(BytesIO(raw), encoding="utf-8-sig")


def ingest_bytes(name: str, raw: bytes) -> dict:
    if not raw.strip():
        raise ValueError("O arquivo está em branco. Baixe de novo em Download CSV no dashboard.")
    if name and not looks_like_csv(name, raw):
        raise ValueError("Esse não parece o CSV do dashboard. Use o botão Download CSV da busca pronta.")
    try:
        frame = read_dashboard_csv(raw)
    except Exception as exc:
        raise ValueError(f"Não foi possível ler o arquivo: {exc}") from exc
    if frame.empty:
        raise ValueError("O CSV não tem empresas. Abra uma busca que já terminou e clique em Download CSV.")
    documents = prepare_for_index(rows_to_documents(frame))
    stored = chroma_collection().count()
    return {
        "ingested": len(documents),
        "columns": [str(column) for column in frame.columns],
        "ready_for_index": True,
        "queued": stored,
        "chroma_path": str(chroma_path()),
        "chroma_count": stored,
        "preview": documents[0].text if documents else "",
    }


def upload_html(message: str = "", ok: bool = False) -> str:
    note = ""
    if message:
        color = "#0a7" if ok else "#b00"
        note = f'<p style="color:{color};white-space:pre-wrap;">{message}</p>'
    return f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Enviar CSV</title>
  </head>
  <body style="font-family: sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem;">
    <h1>Enviar CSV do dashboard</h1>
    <p>1. No dashboard (URL antiga), abra a busca pronta e clique em <strong>Download CSV</strong>.</p>
    <p>2. Aqui, escolha esse arquivo e envie. Não envie o zip.</p>
    {note}
    <form action="/enviar" method="post" enctype="multipart/form-data">
      <p><input type="file" name="file" accept=".csv,text/csv,.txt" required /></p>
      <p><button type="submit" style="padding:0.7rem 1.1rem;background:#111;color:#fff;border:0;border-radius:8px;">Enviar CSV</button></p>
    </form>
  </body>
</html>
"""


@app.get("/")
def health() -> dict:
    try:
        stored = chroma_collection().count()
        path = str(chroma_path())
    except Exception:
        stored = 0
        path = str(CHROMA_PATH)
    return {"status": "ok", "chroma_path": path, "chroma_count": stored}


@app.get("/enviar", response_class=HTMLResponse)
def upload_page() -> str:
    return upload_html()


@app.post("/enviar", response_class=HTMLResponse)
async def upload_form(file: UploadFile = File(...)) -> str:
    raw = await file.read()
    try:
        result = ingest_bytes(file.filename or "", raw)
    except ValueError as exc:
        return upload_html(str(exc), ok=False)
    except Exception as exc:
        return upload_html(f"Falha ao processar o arquivo: {exc}", ok=False)
    return upload_html(
        f"Certo. {result['ingested']} empresas gravadas no Chroma ({result['chroma_count']} no índice).",
        ok=True,
    )


@app.get("/baixar", response_class=HTMLResponse)
def download_page() -> str:
    return """<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Baixar FastAPI RAG</title>
  </head>
  <body style="font-family: sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem;">
    <h1>Baixar o código</h1>
    <p>Clique no botão. No Windows: botão direito no arquivo → Extrair tudo.</p>
    <p><a href="/fastapi-rag.zip" download="fastapi-rag.zip" style="display:inline-block;padding:0.8rem 1.2rem;background:#111;color:#fff;text-decoration:none;border-radius:8px;">Baixar fastapi-rag.zip</a></p>
  </body>
</html>
"""


@app.get("/fastapi-rag.zip")
def download_zip() -> FileResponse:
    path = Path(__file__).with_name("fastapi-rag.zip")
    if not path.is_file():
        path = Path("public/fastapi-rag.zip")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="O zip ainda não está neste servidor.")
    return FileResponse(path, media_type="application/zip", filename="fastapi-rag.zip")


@app.post("/api/v1/ingest-csv")
async def ingest_csv(file: UploadFile = File(...)) -> dict:
    raw = await file.read()
    try:
        return ingest_bytes(file.filename or "", raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
