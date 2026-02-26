#!/usr/bin/env python3
import requests, base64, time, os

API_TOKEN = "r8_ZOal9q8TI7NZXJvjeDvKG2m4Vi1obRD0bsPO0"
IMAGES = [
    "/Users/zay/sol-battlefield/aureus/frontend/public/assets/roman.png",
    "/Users/zay/sol-battlefield/aureus/frontend/public/assets/pillar.png"
]

headers = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json",
}

for filepath in IMAGES:
    filename = os.path.basename(filepath)
    print(f"Processing {filename}...")

    with open(filepath, "rb") as f:
        img_data = base64.b64encode(f.read()).decode("utf-8")

    data_uri = f"data:image/png;base64,{img_data}"

    response = requests.post(
        "https://api.replicate.com/v1/models/bria/remove-background/predictions",
        headers={**headers, "Prefer": "wait"},
        json={"input": {"image": data_uri}},
        timeout=120,
    )

    result = response.json()

    if result.get("status") in ("processing", "starting"):
        prediction_id = result["id"]
        for _ in range(60):
            time.sleep(2)
            poll = requests.get(
                f"https://api.replicate.com/v1/predictions/{prediction_id}",
                headers=headers,
            )
            result = poll.json()
            if result["status"] == "succeeded":
                break
            elif result["status"] == "failed":
                err = result.get("error")
                print(f"   FAILED: {err}")
                break

    output_url = result.get("output")
    if not output_url:
        status = result.get("status")
        print(f"   No output. Status: {status}")
        continue

    img_response = requests.get(output_url)
    if img_response.status_code == 200:
        with open(filepath, "wb") as f:
            f.write(img_response.content)
        print(f"   Done: {filename}")
    else:
        print(f"   Download failed for {filename}")

print("All done!")
