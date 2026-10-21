
"""
Rubric-to-Book Evidence Retriever

Links clinical evaluation criteria to relevant
pages from Clinical Cases In Paediatrics.

This script retrieves reference material only.
It does not grade students or validate medical advice.
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from search_book import search_book


BASE_DIR = Path(__file__).resolve().parents[1]

RUBRICS_DIR = BASE_DIR / "app" / "evaluation" / "rubrics"

OUTPUT_DIR = BASE_DIR / "references" / "processed"

BOOK_NAME = "Clinical Cases In Paediatrics"
BOOK_YEAR = 1997


# ============================================================
# RETRIEVAL CONFIGURATION
# ============================================================

# Search queries are specifically written for the current
# pediatric respiratory case.
#
# Each entry links a rubric criterion to topics and keywords.
#
# These are retrieval hints, not medical answers.

CRITERION_SEARCH = {
    # HISTORY TAKING

    "H01": {
        "query": (
            "pneumonia history taking onset duration "
            "fever cough when symptoms begin"
        ),
        "topics": ["pneumonia"],
    },
    "H02": {
        "query": (
            "history taking cough characteristics severity "
            "frequency dry productive day night"
        ),
        "topics": ["pneumonia", "asthma"],
    },
    "H03": {
        "query": (
            "pneumonia fever cough tachypnoea dyspnoea "
            "wheezing noisy breathing associated symptoms"
        ),
        "topics": ["pneumonia"],
    },
    "H04": {
        "query": (
            "bronchial asthma recurrent attacks previous "
            "respiratory illness admissions past history"
        ),
        "topics": ["asthma", "pneumonia"],
    },
    "H05": {
        "query": (
            "history previous medications drugs treatment "
            "response bronchodilators respiratory illness"
        ),
        "topics": ["asthma", "pneumonia"],
    },
    "H06": {
        "query": (
            "history associated symptoms family history "
            "allergens exposure previous illness"
        ),
        "topics": ["asthma", "pneumonia"],
    },

    # PHYSICAL EXAMINATION

    "E01": {
        "query": (
            "respiratory rate tachypnoea breathing "
            "vital signs pneumonia asthma"
        ),
        "topics": ["pneumonia", "asthma"],
    },
    "E02": {
        "query": (
            "vital signs pulse temperature fever "
            "tachycardia clinical examination"
        ),
        "topics": ["pneumonia", "asthma"],
    },
    "E03": {
        "query": (
            "chest examination auscultation air entry "
            "wheezes crepitations bronchopneumonia"
        ),
        "topics": ["pneumonia", "asthma"],
    },
    "E04": {
        "query": (
            "general look respiratory distress cyanosis "
            "consciousness severe asthma pneumonia"
        ),
        "topics": ["asthma", "pneumonia"],
    },
    "E05": {
        "query": (
            "heart examination cardiac complications "
            "pneumonia wheezy chest"
        ),
        "topics": ["pneumonia", "asthma"],
    },

    # INVESTIGATIONS

    "I01": {
        "query": (
            "chest X-ray bronchopneumonia scattered "
            "patches opacities bilateral lungs"
        ),
        "topics": ["pneumonia"],
    },
    "I02": {
        "query": (
            "blood gases severe asthma PO2 PCO2 "
            "hypoxia respiratory failure"
        ),
        "topics": ["asthma"],
    },
    "I03": {
        "query": (
            "pneumonia investigations complete blood "
            "picture leukocytosis infection"
        ),
        "topics": ["pneumonia"],
    },

    # CLINICAL REASONING

    "D01": {
        "query": (
            "pneumonia clinical features history "
            "examination cough fever crepitations"
        ),
        "topics": ["pneumonia"],
    },
    "D02": {
        "query": (
            "bronchopneumonia bronchial asthma wheezes "
            "crepitations differential diagnosis"
        ),
        "topics": ["pneumonia", "asthma"],
    },
    "D03": {
        "query": (
            "bronchial asthma viral infection trigger "
            "wheezes pneumonia respiratory infection"
        ),
        "topics": ["asthma", "pneumonia"],
    },
    "D04": {
        "query": (
            "bronchopneumonia diagnosis "
            "clinical examination investigations "
            "chest X-ray"
        ),
        "topics": ["pneumonia"],
    },
}


# These criteria should not be evaluated using this
# disease-specific textbook alone.
#
# Communication requires a separate assessment framework.
# Appropriateness of ordering investigations and quality
# of student reasoning require additional clinical review.

NON_BOOK_CRITERIA = {
    "C01": "Requires communication assessment framework",
    "C02": "Requires communication assessment framework",
    "C03": "Requires communication assessment framework",
    "C04": "Requires communication assessment framework",
    "C05": "Requires communication assessment framework",
    "I04": (
        "Requires clinical appropriateness criteria; "
        "the textbook alone does not define over-testing"
    ),
    "D05": (
        "Requires assessment of the student's justification "
        "against case evidence and validated clinical criteria"
    ),
}


# Pages that still contain noticeable OCR problems.
# A retrieved match from these pages must be checked
# against the original book before clinical use.

OCR_REVIEW_PAGES = {5, 6, 7, 8, 9, 10, 11}


# ============================================================
# FILE HELPERS
# ============================================================

def load_json(path: Path) -> dict:
    if not path.is_file():
        raise FileNotFoundError(
            f"Required file not found: {path}"
        )

    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_json(path: Path, data: dict):
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with path.open("w", encoding="utf-8") as file:
        json.dump(
            data,
            file,
            ensure_ascii=False,
            indent=2,
        )


# ============================================================
# RUBRIC VALIDATION
# ============================================================

def validate_rubric(rubric: dict):
    domains = rubric.get("domains", [])

    if not domains:
        raise ValueError("Rubric contains no domains.")

    criterion_ids = []
    total_score = 0

    for domain in domains:
        criteria = domain.get("criteria", [])

        domain_total = sum(
            criterion["max_score"]
            for criterion in criteria
        )

        expected = domain.get("max_score", 0)

        if domain_total != expected:
            raise ValueError(
                f"Domain {domain['id']} has "
                f"{domain_total} criterion points, "
                f"expected {expected}"
            )

        total_score += domain_total

        for criterion in criteria:
            criterion_ids.append(criterion["id"])

    if len(criterion_ids) != len(set(criterion_ids)):
        raise ValueError(
            "Rubric has duplicate criterion IDs."
        )

    if total_score != rubric.get("total_points"):
        raise ValueError(
            f"Rubric score mismatch: {total_score}"
        )

    missing_config = set(criterion_ids) - (
        set(CRITERION_SEARCH)
        | set(NON_BOOK_CRITERIA)
    )

    if missing_config:
        raise ValueError(
            "Missing retrieval configuration for: "
            + ", ".join(sorted(missing_config))
        )


# ============================================================
# RETRIEVE BOOK EVIDENCE
# ============================================================

def retrieve_criterion(
    criterion: dict,
    top_k: int,
) -> dict:
    criterion_id = criterion["id"]

    base_result = {
        "criterion_id": criterion_id,
        "description": criterion["description"],
        "max_score": criterion["max_score"],
        "references": [],
    }

    if criterion_id in NON_BOOK_CRITERIA:
        return {
            **base_result,
            "retrieval_status": "not_book_based",
            "note": NON_BOOK_CRITERIA[criterion_id],
        }

    config = CRITERION_SEARCH[criterion_id]

    results = search_book(
        query=config["query"],
        topics=config["topics"],
        top_k=top_k,
    )

    references = []

    for result in results:
        page = result["page"]

        references.append({
            "source": BOOK_NAME,
            "publication_year": BOOK_YEAR,
            "pdf_page": page,
            "similarity_score": result["score"],
            "retrieved_text": result["text"],
            "requires_ocr_review": (
                page in OCR_REVIEW_PAGES
            ),
            "clinical_validation": "pending",
        })

    return {
        **base_result,
        "retrieval_status": (
            "retrieved" if references
            else "no_match"
        ),
        "search_query": config["query"],
        "topics": config["topics"],
        "references": references,
    }


# ============================================================
# BUILD EVIDENCE FILE
# ============================================================

def build_evidence(
    case_id: str,
    top_k: int = 2,
) -> dict:
    rubric_path = RUBRICS_DIR / f"{case_id}.json"

    rubric = load_json(rubric_path)

    if rubric.get("case_id") != case_id:
        raise ValueError(
            "Rubric case_id does not match request."
        )

    validate_rubric(rubric)

    domains = []

    for domain in rubric["domains"]:
        criteria_results = []

        print(
            f"\nDomain: {domain['name']}"
        )

        for criterion in domain["criteria"]:
            result = retrieve_criterion(
                criterion,
                top_k=top_k,
            )

            criteria_results.append(result)

            pages = [
                ref["pdf_page"]
                for ref in result["references"]
            ]

            print(
                f"  {criterion['id']}: "
                f"{result['retrieval_status']} "
                f"| pages={pages}"
            )

        domains.append({
            "domain_id": domain["id"],
            "domain_name": domain["name"],
            "max_score": domain["max_score"],
            "criteria": criteria_results,
        })

    return {
        "case_id": case_id,
        "rubric_version": rubric.get("rubric_version"),
        "generated_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "reference_book": {
            "title": BOOK_NAME,
            "publication_year": BOOK_YEAR,
            "source_format": "OCR-corrected JSON",
        },
        "status": "retrieved_pending_clinical_validation",
        "warning": (
            "Retrieved text is not verified medical guidance. "
            "This 1997 book contains OCR errors and potentially "
            "outdated recommendations. Retrieval scores are "
            "not student assessment scores."
        ),
        "domains": domains,
    }


# ============================================================
# COMMAND LINE
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description=(
            "Retrieve textbook evidence "
            "for a case evaluation rubric"
        )
    )

    parser.add_argument(
        "--case-id",
        default="PED-RT-0002",
    )

    parser.add_argument(
        "--top-k",
        type=int,
        default=2,
    )

    args = parser.parse_args()

    if args.top_k < 1:
        parser.error("--top-k must be at least 1")

    evidence = build_evidence(
        case_id=args.case_id,
        top_k=args.top_k,
    )

    output_path = (
        OUTPUT_DIR
        / f"{args.case_id}_book_evidence.json"
    )

    save_json(output_path, evidence)

    all_criteria = [
        criterion
        for domain in evidence["domains"]
        for criterion in domain["criteria"]
    ]

    retrieved = sum(
        c["retrieval_status"] == "retrieved"
        for c in all_criteria
    )

    not_book_based = sum(
        c["retrieval_status"] == "not_book_based"
        for c in all_criteria
    )

    no_match = sum(
        c["retrieval_status"] == "no_match"
        for c in all_criteria
    )

    print("\n" + "=" * 55)
    print("RUBRIC BOOK RETRIEVAL COMPLETE")
    print("=" * 55)

    print(f"Case: {args.case_id}")
    print(f"Total criteria: {len(all_criteria)}")
    print(f"Retrieved: {retrieved}")
    print(f"Not book based: {not_book_based}")
    print(f"No matches: {no_match}")
    print(f"Output: {output_path}")

    print(
        "\nNote: Book references still require "
        "OCR and clinical validation."
    )


if __name__ == "__main__":
    main()
