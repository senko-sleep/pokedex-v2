import requests
import json
import os
import time
import random
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed
import sys

# Constants
API_URL = "https://api.pokemontcg.io/v2/cards"
OUTPUT_FILE = "data/cards.json"
TMP_FILE = "data/cards_tmp.json"
HEADERS = {"X-Api-Key": "9e42b016-32cd-4b83-8cfc-b4ff86ea6fee"}  # Replace with your API key
PAGE_SIZE = 250  # max allowed by API
MAX_WORKERS = 10  # reduce a bit to avoid overloading API
RETRY_DELAY = 2
MAX_RETRIES = 8
BACKOFF_FACTOR = 2

# Ensure data folder exists
os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

def fetch_page(page):
    url = f"{API_URL}?page={page}&pageSize={PAGE_SIZE}"
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            if resp.status_code in (429, 500, 502, 503, 504):  # Rate limit or server errors
                sleep_time = BACKOFF_FACTOR ** attempt + random.uniform(0, 1)
                print(f"Page {page} HTTP {resp.status_code}. Retrying in {sleep_time:.1f}s...")
                time.sleep(sleep_time)
                continue
            resp.raise_for_status()
            data = resp.json().get("data", [])
            return data
        except requests.exceptions.RequestException as e:
            sleep_time = RETRY_DELAY * (attempt + 1)
            print(f"Error fetching page {page}, attempt {attempt + 1}: {e}. Sleeping {sleep_time}s")
            time.sleep(sleep_time)
    print(f"Failed to fetch page {page} after {MAX_RETRIES} attempts")
    return []

def save_data_safely(cards):
    tmp_cards = []
    if os.path.exists(TMP_FILE):
        try:
            with open(TMP_FILE, "r", encoding="utf-8") as f:
                tmp_cards = json.load(f)
        except json.JSONDecodeError:
            tmp_cards = []
    tmp_cards.extend(cards)
    with open(TMP_FILE, "w", encoding="utf-8") as f:
        json.dump(tmp_cards, f, ensure_ascii=False, indent=2)

def main():
    # Step 1: Get total count
    url = f"{API_URL}?page=1&pageSize=1"
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            if resp.status_code in (429, 500, 502, 503, 504):
                sleep_time = BACKOFF_FACTOR ** attempt + random.uniform(0, 1)
                print(f"Total count HTTP {resp.status_code}. Retrying in {sleep_time:.1f}s...")
                time.sleep(sleep_time)
                continue
            resp.raise_for_status()
            total_count = resp.json().get("totalCount")
            if total_count is None:
                print("No 'totalCount' found in API response.")
                sys.exit(1)
            break
        except requests.exceptions.RequestException as e:
            sleep_time = RETRY_DELAY * (attempt + 1)
            print(f"Error fetching total count, attempt {attempt+1}: {e}. Sleeping {sleep_time}s")
            time.sleep(sleep_time)
    else:
        print("Failed to fetch total count after retries.")
        sys.exit(1)

    total_pages = (total_count + PAGE_SIZE - 1) // PAGE_SIZE
    print(f"Total cards: {total_count}, pages: {total_pages}")

    # Load existing tmp data
    all_cards = []
    start_page = 1
    if os.path.exists(TMP_FILE):
        try:
            with open(TMP_FILE, "r", encoding="utf-8") as f:
                all_cards = json.load(f)
            fetched_count = len(all_cards)
            if fetched_count >= total_count:
                print("Data already complete in tmp file.")
            else:
                start_page = (fetched_count // PAGE_SIZE) + 1
                print(f"Resuming from page {start_page}, already have {fetched_count}/{total_count} cards")
        except Exception as e:
            print(f"Error loading tmp file: {e}. Starting from scratch.")
            all_cards = []
            start_page = 1

    if start_page > total_pages:
        print("Nothing more to fetch.")
    else:
        page_to_cards = {}
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {executor.submit(fetch_page, page): page for page in range(start_page, total_pages + 1)}
            for future in tqdm(as_completed(futures), total=len(futures), desc="Fetching pages", unit="page"):
                page = futures[future]
                try:
                    page_cards = future.result()
                    page_to_cards[page] = page_cards
                    save_data_safely(page_cards)
                except Exception as exc:
                    print(f"Page {page} generated an exception: {exc}")

        # Append new cards in order
        for page in range(start_page, total_pages + 1):
            if page in page_to_cards:
                all_cards.extend(page_to_cards[page])

    # Final save
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_cards, f, ensure_ascii=False, indent=2)
    if os.path.exists(TMP_FILE):
        os.remove(TMP_FILE)
    print(f"Saved {len(all_cards)} cards to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
