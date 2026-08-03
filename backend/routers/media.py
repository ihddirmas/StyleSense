"""Media pipeline status for judges and ops (B2 + Genblaze)."""
from fastapi import APIRouter

from services import genblaze_media_service

router = APIRouter()


@router.get("/status")
def media_pipeline_status():
    configured = genblaze_media_service.is_configured()
    bucket = genblaze_media_service._bucket_name() if configured else None
    return {
        "b2_configured": configured,
        "genblaze_ingest_enabled": configured,
        "genblaze_animate_enabled": configured,
        "bucket": bucket,
        "pipeline": {
            "tryon_still": "Runway gen4_image → Supabase CDN → Genblaze Pipeline.ingest → B2",
            "animate": "Genblaze Pipeline + RunwayProvider (veo3.1) → B2 ObjectStorageSink",
        },
        "provenance": "SHA-256 canonical manifest per ingest/animate run (manifest.verify())",
    }
