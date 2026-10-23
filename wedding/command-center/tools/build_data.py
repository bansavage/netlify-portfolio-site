#!/usr/bin/env python3
"""Build the Command Center's data files from the venue atlas package.

usage: python3 build_data.py <atlas-folder> <out-folder>

<atlas-folder> is the mexico-wedding-venue-atlas package (map/, pricing/, venues/ ...).
Writes atlas.json (venues + cost model) and geo.json (basemap) into <out-folder>.

Every cost row keeps its 60- and 70-guest amounts so the app can price any guest
count, and gets a category: the atlas's standard stack lines become editable
"vision" lines, everything else stays a venue line.
"""
import json
import re
import sys
from pathlib import Path

STACK = [
    # (category, regex on the row label)
    ("buffet", r"^Mexican buffet \(caterer"),
    ("taco", r"^Live taquero station"),
    ("bar", r"^Open bar . BYO alcohol"),
    ("mariachi", r"^Mariachi, cocktail hour"),
    ("band", r"^Live band \(first part"),
    ("dj", r"^DJ \+ lighting"),
    ("photo", r"^Photographer \("),
    ("coord", r"^Coordinator \(month-of\)"),
    ("officiant", r"^Symbolic officiant"),
    ("decor", r"^D[eé]cor: papel picado"),
    ("extras", r"^Lighting / lounge"),
    ("tips", r"^Tips \(waiters"),
    # venue rules: added only where the atlas's rules call for them
    ("planner", r"^Wedding planner \(required"),
    ("generator", r"^Generator \(planta"),
    ("heaters", r"^Patio heaters"),
    ("tent", r"^Tent \("),
    ("shuttles", r"^Guest shuttles"),
    ("contingency", r"^Contingency"),
]


def categorize(label):
    for cat, rx in STACK:
        if re.search(rx, label):
            return cat
    return "venue"


def main(src, out):
    src, out = Path(src), Path(out)
    html = (src / "map" / "mexico-venue-map.html").read_text(encoding="utf-8")
    m = re.search(r"^window\.__DATA__ = (.*?);?\s*$", html, re.M)
    data = json.loads(m.group(1))
    pricing = json.loads((src / "pricing" / "all-in-pricing.json").read_text(encoding="utf-8"))

    venues = []
    for v in data["venues"]:
        rec = {k: v.get(k) for k in (
            "key", "name", "short", "status", "rank", "headline_rank", "score", "scores",
            "groupLabel", "state", "town", "place", "place_hint", "address", "lat", "lng",
            "loc_note", "loc_precision", "end", "end_h", "end_src", "taq_label", "taq_txt",
            "beds", "beds_txt", "ap", "drive", "rev", "conf", "review_flags", "catch",
            "reason", "description", "type", "motifs", "callouts", "facts", "mentions",
            "photos_url", "src", "nextstep", "quote_order", "rooms_usd",
        )}
        rec = {k: val for k, val in rec.items() if val not in (None, "", [])}
        if v.get("p60") and v.get("p70"):
            r60, r70 = v["p60"]["rows"], v["p70"]["rows"]
            assert [r[0] for r in r60] == [r[0] for r in r70], v["key"]
            rows = []
            for a, b in zip(r60, r70):
                cat = categorize(a[0])
                row = [a[0], a[1], b[1], 1 if a[2] else 0, a[3] or "", cat]
                rows.append(row)
            rec["rows"] = rows
            rec["atlas_usd"] = [v["p60"]["usd"], v["p70"]["usd"], v["p60"]["weekend_usd"], v["p70"]["weekend_usd"]]
        venues.append(rec)

    model = pricing["model"]
    meta = {
        "generated": data["meta"]["generated"],
        "fx": data["meta"]["fx"],
        "weights": data["meta"]["weights"],
        "rules": data["meta"]["rules"],
        "counts": data["meta"]["counts"],
        "stack_mxn": model["stack_mxn"],
        "weekend": model["weekend"],
        "headline_gate": model["headline_gate"],
        "questions": data["questions"],
        "quote_needed": pricing.get("quote_needed", []),
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "atlas.json").write_text(json.dumps({"meta": meta, "venues": venues}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out / "geo.json").write_text(json.dumps(data["geo"], ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    cats = {}
    for v in venues:
        for r in v.get("rows", []):
            cats[r[5]] = cats.get(r[5], 0) + 1
    print(f"{len(venues)} venues, {sum(1 for v in venues if 'rows' in v)} priced; row categories: {cats}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
