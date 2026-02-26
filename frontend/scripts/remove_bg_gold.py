#!/usr/bin/env python3
import requests, base64, time, os

API_TOKEN = "r8_ZOal9q8TI7NZXJvjeDvKG2m4Vi1obRD0bsPO0"
IMAGES = [
    "/Users/zay/sol-battlefield/aureus/frontend/public/assets/replicate-prediction-s6hwhtgthnrmt0cwf4cstr5778.png",
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

    out_path = "/Users/zay/sol-battlefield/aureus/frontend/public/assets/gold-nugget.png"
    img_response = requests.get(output_url)
    if img_response.status_code == 200:
        with open(out_path, "wb") as f:
            f.write(img_response.content)
        print(f"   Done: saved to {out_path}")
    else:
        print(f"   Download failed for {filename}")

print("All done!")
