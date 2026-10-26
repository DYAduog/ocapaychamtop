from fastapi import FastAPI
from routers import MB_crawl_router
from routers import MB_biz_crawl_router

app = FastAPI()

app.include_router(MB_biz_crawl_router.router, prefix="/MB_biz_crawl", tags=["MB"])
@app.get("/")
def read_root():
    return {"message": "[GOHUB] - [THANHAN] - MBBANK FASTAPI ENDPOINTS!"}