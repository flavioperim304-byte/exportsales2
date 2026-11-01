from io import BytesIO
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from llama_index.core import Document

app = FastAPI()

# Rows already turned into LlamaIndex documents, ready for VectorStoreIndex.
pending_documents: list[Document] = []


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


def prepare_for_index(documents: list[Document]) -> list[Document]:
    """Keep structured documents in memory for a later VectorStoreIndex.from_documents call."""
    pending_documents.extend(documents)
    return documents


@app.get("/")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
    name = (file.filename or "").lower()
    if name and not name.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Envie um arquivo .csv gerado pelo dashboard.")

    raw = await file.read()
    if not raw.strip():
        raise HTTPException(status_code=400, detail="O CSV está vazio.")

    try:
        frame = pd.read_csv(BytesIO(raw), encoding="utf-8-sig")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Não foi possível ler o CSV: {exc}") from exc

    if frame.empty:
        raise HTTPException(status_code=400, detail="O CSV não tem linhas de dados.")

    documents = prepare_for_index(rows_to_documents(frame))
    preview = documents[0].text if documents else ""
    return {
        "ingested": len(documents),
        "columns": [str(column) for column in frame.columns],
        "ready_for_index": True,
        "queued": len(pending_documents),
        "preview": preview,
    }
