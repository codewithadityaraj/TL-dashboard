import csv
import io
import json
import time
from fastapi import FastAPI, Query, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

app = FastAPI()

LEADS_URL = (
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQe0m4OUvApuACPrN8jWN7twZuoGgZA3jj3ZU9Adp1C5LTe_8DZD7rseDmtxoaE7poMn7CMd4nVxyoZ/pub?gid=1770292739&single=true&output=csv"
)

SHEET_URLS = {
    "productivity": (
        "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6_Ukl-_qTeyobt1Q3SpgXhR0921qgUWrz6WPnINvl3U2OXl1dcsjEyGgMafUmG_cb9rE6QNrWZkuX/pub?gid=948739317&single=true&output=csv"
    ),
    "revenue-token": (
        "https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=0&single=true&output=csv"
    ),
    "revenue-full": (
        "https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=1494867608&single=true&output=csv"
    ),
    "cohort-targets": (
        "https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=846488199&single=true&output=csv"
    ),
    "tl-targets": (
        "https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=209837982&single=true&output=csv"
    ),
    "bd-targets": (
        "https://docs.google.com/spreadsheets/d/e/2PACX-1vSYw0XpoBrl5gNAHq3n2p-OLAEOHwsBVVQy70ffPRRSk2SloYaqPPZ1X6YcuesaGvzlgf1EDUE8bwJV/pub?gid=68498859&single=true&output=csv"
    ),
}

LEADS_CACHE = {"body": None, "fetched_at": 0.0}
CACHE_TTL_SEC = 300


def fetch_url(url: str, timeout: int = 60) -> bytes:
    req = Request(url, headers={"User-Agent": "GM-Dashboard-Local/1.0"})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


def get_leads_rows() -> list[dict]:
    now = time.time()
    if LEADS_CACHE["body"] is None or now - LEADS_CACHE["fetched_at"] > CACHE_TTL_SEC:
        LEADS_CACHE["body"] = fetch_url(LEADS_URL)
        LEADS_CACHE["fetched_at"] = now
    text = LEADS_CACHE["body"].decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def field(row: dict, names: list[str]) -> str:
    for name in names:
        val = row.get(name)
        if val is not None and str(val).strip():
            return str(val).strip()
    return ""


def normalize_date(val: str) -> str:
    if not val:
        return ""
    s = str(val).strip()
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    parts = s.split("/")
    if len(parts) == 3:
        mm = parts[0].zfill(2)
        dd = parts[1].zfill(2)
        yy = parts[2].strip()
        if len(yy) == 2:
            yy = f"20{yy}"
        return f"{yy}-{mm}-{dd}"
    return s[:10]


def matches_lead_filters(row: dict, filters: dict) -> bool:
    created_on = normalize_date(field(row, ["Created On"]))
    gm = field(row, ["GM NAME"])
    program = field(row, ["Program"])
    tl = field(row, ["TL Name ", "TL Name"])
    owner = field(row, ["Owner (User Email)"])

    if filters.get("dateFrom") and created_on and created_on < filters["dateFrom"]:
        return False
    if filters.get("dateTo") and created_on and created_on > filters["dateTo"]:
        return False
    if filters.get("gm") and gm != filters["gm"]:
        return False
    if filters.get("program") and program != filters["program"]:
        return False
    if filters.get("tl") and tl != filters["tl"]:
        return False
    if filters.get("bde") and owner != filters["bde"]:
        return False
    return True


def build_leads_meta(rows: list[dict]) -> dict:
    date_min = ""
    date_max = ""
    gms, programs, tls, bdes = set(), set(), set(), set()
    for row in rows:
        created_on = normalize_date(field(row, ["Created On"]))
        if created_on:
            date_min = created_on if not date_min or created_on < date_min else date_min
            date_max = created_on if not date_max or created_on > date_max else date_max
        gm = field(row, ["GM NAME"])
        program = field(row, ["Program"])
        tl = field(row, ["TL Name ", "TL Name"])
        owner = field(row, ["Owner (User Email)"])
        if gm:
            gms.add(gm)
        if program:
            programs.add(program)
        if tl:
            tls.add(tl)
        if owner:
            bdes.add(owner)
    return {
        "dateMin": date_min,
        "dateMax": date_max,
        "rowCount": len(rows),
        "gms": sorted(gms),
        "programs": sorted(programs),
        "tls": sorted(tls),
        "bdes": sorted(bdes),
    }


DEFAULT_URLS = {
    "leads": LEADS_URL,
    "productivity": SHEET_URLS["productivity"],
    "revenueToken": SHEET_URLS["revenue-token"],
    "revenueFull": SHEET_URLS["revenue-full"],
}

app.mount("/static", StaticFiles(directory="."), name="static")


@app.get("/api/config")
def sheet_config():
    import os
    return {
        "leads": os.getenv("SHEET_URL_LEADS", DEFAULT_URLS["leads"]),
        "productivity": os.getenv("SHEET_URL_PRODUCTIVITY", DEFAULT_URLS["productivity"]),
        "revenueToken": os.getenv("SHEET_URL_REVENUE_TOKEN", DEFAULT_URLS["revenueToken"]),
        "revenueFull": os.getenv("SHEET_URL_REVENUE_FULL", DEFAULT_URLS["revenueFull"]),
    }


@app.get("/api/leads")
def leads_proxy(
    meta: str | None = Query(None),
    dateFrom: str | None = Query(None),
    dateTo: str | None = Query(None),
    gm: str | None = Query(None),
    program: str | None = Query(None),
    tl: str | None = Query(None),
    bde: str | None = Query(None),
):
    try:
        rows = get_leads_rows()
        if meta == "1":
            return Response(
                content=json.dumps(build_leads_meta(rows)),
                media_type="application/json",
                headers={"Cache-Control": "public, max-age=300"},
            )

        filters = {
            "dateFrom": dateFrom or "",
            "dateTo": dateTo or "",
            "gm": gm if gm and gm != "ALL" else "",
            "program": program if program and program != "ALL" else "",
            "tl": tl if tl and tl != "ALL" else "",
            "bde": bde if bde and bde != "ALL" else "",
        }
        filtered = [r for r in rows if matches_lead_filters(r, filters)]
        if not rows:
            return Response(content="", media_type="text/csv; charset=utf-8")

        output = io.StringIO()
        fieldnames = list(rows[0].keys())
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(filtered)
        return Response(
            content=output.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={
                "Cache-Control": "public, max-age=120",
                "X-Filtered-Rows": str(len(filtered)),
                "X-Total-Rows": str(len(rows)),
            },
        )
    except HTTPError as exc:
        return Response(
            status_code=exc.code,
            content=f'{{"error":"Google Sheets returned HTTP {exc.code}"}}',
            media_type="application/json",
        )
    except URLError as exc:
        return Response(
            status_code=502,
            content=f'{{"error":"{exc.reason}"}}',
            media_type="application/json",
        )


@app.get("/api/sheets")
def sheets_proxy(sheet: str = Query(...)):
    url = SHEET_URLS.get(sheet)
    if not url:
        return Response(
            status_code=400,
            content='{"error":"Invalid or missing sheet parameter"}',
            media_type="application/json",
        )
    try:
        body = fetch_url(url)
        return Response(
            content=body,
            media_type="text/csv; charset=utf-8",
            headers={"Cache-Control": "public, max-age=300"},
        )
    except HTTPError as exc:
        return Response(
            status_code=exc.code,
            content=f'{{"error":"Google Sheets returned HTTP {exc.code}"}}',
            media_type="application/json",
        )
    except URLError as exc:
        return Response(
            status_code=502,
            content=f'{{"error":"{exc.reason}"}}',
            media_type="application/json",
        )


@app.get("/")
def root():
    return FileResponse("index.html")


@app.get("/favicon.ico")
def favicon():
    return Response(status_code=404)


@app.get("/{path:path}")
def catch_all(path: str):
    import os
    if os.path.isfile(path):
        return FileResponse(path)
    return Response(status_code=404)
