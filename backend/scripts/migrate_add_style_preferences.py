#!/usr/bin/env python3
"""Apply the v2i migration: add style_preferences column to users table."""
import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
import boto3

# Load .env
env_file = Path(__file__).parent.parent / ".env"
load_dotenv(env_file)

print("Adding style_preferences column to users table...")

if os.getenv("AURORA_IAM_AUTH") == "true":
    # Generate IAM token
    region = os.getenv("AWS_REGION", "ap-south-1")
    host = os.getenv("AURORA_HOST")
    port = int(os.getenv("AURORA_PORT", "5432"))
    user = os.getenv("AURORA_USER", "postgres")

    client = boto3.client("rds", region_name=region)
    token = client.generate_db_auth_token(
        DBHostname=host,
        Port=port,
        DBUsername=user,
        Region=region,
    )

    import ssl
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_REQUIRED

    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=token,
            database="postgres",
            sslmode="require",
        )
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS style_preferences JSONB DEFAULT '[]'::jsonb")
            conn.commit()
        print("[OK] Migration applied successfully")
    except Exception as e:
        print(f"[ERROR] {e}")
        exit(1)
else:
    db_url = os.getenv("AURORA_DATABASE_URL")
    if not db_url:
        print("[ERROR] No AURORA_DATABASE_URL or IAM auth config")
        exit(1)

    try:
        conn = psycopg2.connect(db_url)
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS style_preferences JSONB DEFAULT '[]'::jsonb")
            conn.commit()
        print("[OK] Migration applied successfully")
    except Exception as e:
        print(f"[ERROR] {e}")
        exit(1)
