"""URL → product image scraper. Uses og:image meta tag (works on most e-commerce)."""
from fastapi import APIRouter, Depends

from models.schemas import ScrapeRequest, ScrapeResponse
from services.auth_service import current_user
from services.scrape_service import scrape_product

router = APIRouter()


@router.post("/product-url", response_model=ScrapeResponse)
async def scrape_product_url(req: ScrapeRequest, user = Depends(current_user)):
    return await scrape_product(req.url)
