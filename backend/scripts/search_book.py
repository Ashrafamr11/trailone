
import argparse
import json
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


BASE_DIR = Path(__file__).resolve().parents[1]

BOOK_PATH = (
    BASE_DIR
    / "references"
    / "clinical_cases_in_paediatrics.json"
)

# PDF page numbers, not printed book page numbers.
TOPIC_PAGES = {
    "asthma": (4, 12),
    "pneumonia": (13, 18),
}


def load_book():
    if not BOOK_PATH.is_file():
        raise FileNotFoundError(
            f"Book JSON not found: {BOOK_PATH}"
        )

    with BOOK_PATH.open(
        "r", encoding="utf-8"
    ) as file:
        book = json.load(file)

    if not isinstance(book.get("pages"), list):
        raise ValueError(
            "Book JSON must contain a pages list."
        )

    pages = []

    for item in book["pages"]:
        page_number = item.get("page")
        content = item.get("text", "")

        if not isinstance(page_number, int):
            continue

        if not isinstance(content, str):
            continue

        if not content.strip():
            continue

        pages.append({
            "page": page_number,
            "text": content.strip(),
        })

    return pages


def filter_by_topics(pages, topics):
    if not topics:
        return pages

    filtered = []

    for page in pages:
        page_number = page["page"]

        for topic in topics:
            start, end = TOPIC_PAGES[topic]

            if start <= page_number <= end:
                filtered.append(page)
                break

    return filtered


def search_book(
    query: str,
    topics: list[str] | None = None,
    top_k: int = 5,
):
    pages = load_book()
    candidates = filter_by_topics(pages, topics)

    if not candidates:
        return []

    documents = [page["text"] for page in candidates]

    vectorizer = TfidfVectorizer(
        lowercase=True,
        strip_accents="unicode",
        stop_words="english",
        ngram_range=(1, 2),
        sublinear_tf=True,
    )

    document_vectors = vectorizer.fit_transform(
        documents
    )

    query_vector = vectorizer.transform([query])

    scores = cosine_similarity(
        query_vector,
        document_vectors,
    )[0]

    ranked_indices = scores.argsort()[::-1]

    results = []

    for index in ranked_indices:
        score = float(scores[index])

        # No lexical match: do not invent relevance.
        if score <= 0:
            continue

        page = candidates[int(index)]

        results.append({
            "source": BOOK_PATH.name,
            "page": page["page"],
            "score": round(score, 4),
            "text": page["text"],
        })

        if len(results) >= top_k:
            break

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Local book retrieval"
    )

    parser.add_argument(
        "--query",
        required=True,
        help="Medical retrieval query in English",
    )

    parser.add_argument(
        "--topics",
        nargs="*",
        choices=list(TOPIC_PAGES),
        default=None,
        help="Optional topic filters",
    )

    parser.add_argument(
        "--top-k",
        type=int,
        default=5,
    )

    args = parser.parse_args()

    if args.top_k < 1:
        parser.error("--top-k must be at least 1")

    results = search_book(
        query=args.query,
        topics=args.topics,
        top_k=args.top_k,
    )

    print(f"\nQuery: {args.query}")
    print(f"Topics: {args.topics or 'all'}")
    print(f"Results found: {len(results)}")

    if not results:
        print(
            "\nNo matching text found. "
            "Try different English terms."
        )
        return

    for index, result in enumerate(results, 1):
        print("\n" + "=" * 65)
        print(f"Result #{index}")
        print(f"Source page: {result['page']}")
        print(f"Similarity score: {result['score']}")
        print("-" * 65)
        print(result["text"][:1200])
        print("=" * 65)


if __name__ == "__main__":
    main()
