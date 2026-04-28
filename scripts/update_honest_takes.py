#!/usr/bin/env python3
"""
update_honest_takes.py

Updates the 'honest_take' field in groupsets.json from a TSV/CSV file.

Auto-detects the delimiter:
- .tsv  → TAB
- .csv  → sniffs first line for ',' or ';' (European Excel exports use ';')

Also strips BOM (Byte Order Mark) which Excel often adds.

Usage:
    python3 update_honest_takes.py honest_takes.csv data/groupsets.json
    python3 update_honest_takes.py honest_takes.tsv data/groupsets.json

The input file must have:
- Header row with at least 'id' and 'honest_take' columns
- One groupset per row
- Other columns are ignored

Behavior:
- Backs up groupsets.json to groupsets.json.bak before changes
- Reports which IDs matched, which didn't, and which JSON entries were untouched
- Preserves all other JSON fields exactly
- Preserves JSON formatting (2-space indent)
"""

import csv
import json
import sys
import shutil
from pathlib import Path


def detect_delimiter(path):
    """Detect delimiter by extension and (for CSV) by sniffing the header."""
    suffix = path.suffix.lower()
    if suffix == ".tsv":
        return "\t"
    if suffix == ".csv":
        # Sniff first line for ; or ,
        with path.open("r", encoding="utf-8-sig") as f:
            first_line = f.readline()
        # If both appear, semicolon wins (European Excel default)
        if ";" in first_line:
            return ";"
        if "," in first_line:
            return ","
        print(f"ERROR: Could not detect delimiter in CSV. First line: {first_line!r}")
        sys.exit(1)
    print(f"ERROR: Unknown file extension '{suffix}'. Use .tsv or .csv.")
    sys.exit(1)


def main():
    if len(sys.argv) != 3:
        print("Usage: python3 update_honest_takes.py <input.tsv|input.csv> <json_file>")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    json_path = Path(sys.argv[2])

    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}")
        sys.exit(1)
    if not json_path.exists():
        print(f"ERROR: JSON file not found: {json_path}")
        sys.exit(1)

    delimiter = detect_delimiter(input_path)
    delim_name = {"\t": "TAB", ",": "COMMA", ";": "SEMICOLON"}[delimiter]
    print(f"Reading {input_path.name} ({delim_name}-separated)...")

    # Read input file into dict {id: honest_take}
    # encoding='utf-8-sig' strips BOM if present
    takes = {}
    with input_path.open("r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        if "id" not in reader.fieldnames or "honest_take" not in reader.fieldnames:
            print(
                f"ERROR: File must have 'id' and 'honest_take' columns.\n"
                f"Found: {reader.fieldnames}"
            )
            sys.exit(1)
        for row in reader:
            gid = (row.get("id") or "").strip()
            take = (row.get("honest_take") or "").strip()
            if gid and take:
                takes[gid] = take

    print(f"Loaded {len(takes)} honest_takes.")

    # Backup JSON
    backup_path = json_path.with_suffix(json_path.suffix + ".bak")
    shutil.copy2(json_path, backup_path)
    print(f"Backup saved: {backup_path}")

    # Read JSON
    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    # Update
    matched = []
    unmatched_in_json = []
    json_ids = {g["id"] for g in data}

    for gid, take in takes.items():
        if gid in json_ids:
            for g in data:
                if g["id"] == gid:
                    g["honest_take"] = take
                    matched.append(gid)
                    break
        else:
            unmatched_in_json.append(gid)

    json_ids_without_takes = json_ids - set(takes.keys())

    # Write JSON back
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")  # trailing newline

    # Report
    print()
    print("--- Report ---")
    print(f"Updated:                       {len(matched)} / {len(takes)}")
    if unmatched_in_json:
        print(f"IDs in input not in JSON:      {len(unmatched_in_json)}")
        for gid in unmatched_in_json:
            print(f"  - {gid}")
    if json_ids_without_takes:
        print(f"IDs in JSON without an entry:  {len(json_ids_without_takes)} (left untouched)")
        for gid in sorted(json_ids_without_takes):
            print(f"  - {gid}")
    print()
    print("Done.")


if __name__ == "__main__":
    main()