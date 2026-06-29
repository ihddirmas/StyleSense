#!/usr/bin/env python3
"""Export architecture diagram from Mermaid to PNG."""

import subprocess
import sys
from pathlib import Path

MERMAID_FILE = Path(".kilo/plans/ARCHITECTURE_DIAGRAM.md")
OUTPUT_FILE = Path("architecture-diagram.png")


def extract_mermaid_code(md_file: Path) -> str:
    """Extract Mermaid code block from markdown file."""
    content = md_file.read_text(encoding="utf-8")
    
    start = content.find("```mermaid")
    if start == -1:
        raise ValueError("No ```mermaid block found in file")
    
    start = content.find("\n", start) + 1
    end = content.find("```", start)
    if end == -1:
        raise ValueError("Unclosed mermaid code block")
    
    return content[start:end].strip()


def export_via_mermaid_cli(mermaid_code: str, output: Path) -> bool:
    """Export using @mermaid-js/mermaid-cli (mmdc)."""
    try:
        temp_mmd = Path("temp_architecture.mmd")
        temp_mmd.write_text(mermaid_code, encoding="utf-8")
        
        result = subprocess.run([
            "mmdc",
            "-i", str(temp_mmd),
            "-o", str(output),
            "-w", "1920",
            "-h", "1080",
            "-b", "transparent"
        ], capture_output=True, text=True, timeout=60)
        
        temp_mmd.unlink(missing_ok=True)
        
        if result.returncode == 0:
            print(f"Exported to {output} via mermaid-cli")
            return True
        else:
            print(f"mermaid-cli failed: {result.stderr}")
            return False
            
    except FileNotFoundError:
        print("mermaid-cli (mmdc) not installed")
        return False
    except subprocess.TimeoutExpired:
        print("mermaid-cli timed out")
        return False


def export_via_mermaid_ink(mermaid_code: str, output: Path) -> bool:
    """Export using mermaid.ink API (no local install needed)."""
    import urllib.parse
    import urllib.request
    
    try:
        encoded = urllib.parse.quote(mermaid_code)
        url = f"https://mermaid.ink/img/{encoded}?type=png&width=1920&height=1080&backgroundColor=transparent"
        
        print("Downloading from mermaid.ink...")
        urllib.request.urlretrieve(url, output)
        
        if output.exists() and output.stat().st_size > 1000:
            print(f"Exported to {output} via mermaid.ink")
            return True
        else:
            print("Downloaded file too small or missing")
            return False
            
    except Exception as e:
        print(f"mermaid.ink export failed: {e}")
        return False


def main():
    print("StyleSense Architecture Diagram Exporter")
    print("=" * 50)
    
    if not MERMAID_FILE.exists():
        print(f"Source file not found: {MERMAID_FILE}")
        sys.exit(1)
    
    try:
        mermaid_code = extract_mermaid_code(MERMAID_FILE)
        print(f"Extracted mermaid code ({len(mermaid_code)} chars)")
    except Exception as e:
        print(f"Failed to extract mermaid: {e}")
        sys.exit(1)
    
    # Try mermaid-cli first (local, higher quality)
    if export_via_mermaid_cli(mermaid_code, OUTPUT_FILE):
        sys.exit(0)
    
    # Fallback to mermaid.ink (cloud, no install)
    print("\nTrying mermaid.ink API...")
    if export_via_mermaid_ink(mermaid_code, OUTPUT_FILE):
        sys.exit(0)
    
    # Manual instructions
    print("\n" + "=" * 50)
    print("MANUAL EXPORT INSTRUCTIONS")
    print("=" * 50)
    print("Option 1: Mermaid Live Editor (easiest)")
    print("  1. Go to https://mermaid.live")
    print("  2. Paste the mermaid code from .kilo/plans/ARCHITECTURE_DIAGRAM.md")
    print("  3. Theme: 'Dark' or 'Neutral'")
    print("  4. Click Export -> PNG -> Save as architecture-diagram.png")
    print()
    print("Option 2: VS Code + Mermaid Preview")
    print("  1. Create architecture.mmd in repo root")
    print("  2. Paste mermaid code")
    print("  3. Ctrl+Shift+V -> Preview")
    print("  4. Right-click -> Save as PNG")
    print()
    print("Option 3: Install mermaid-cli locally")
    print("  npm install -g @mermaid-js/mermaid-cli")
    print("  mmdc -i architecture.mmd -o architecture-diagram.png -w 1920 -h 1080 -b transparent")


if __name__ == "__main__":
    main()