import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

app = Flask(__name__)
CORS(app)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

contacts = {
    "Maya",
    "Mom",
    "Dad",
    "+1 (717) 555-1234"
}

spam_signals = [
    "urgent", "tap", "verify", "delivery", "package",
    "refund", "prize", "gift", "crypto", "password",
    "account", "fee", "http", "winner", "claim"
]


@app.route("/")
def home():
    return "Spam Silencer Python Backend Running"


def local_score(sender, body):
    text = f"{sender} {body}".lower()
    score = 0
    hits = []

    if sender in contacts:
        return 0, ["existing contact"]

    for word in spam_signals:
        if word in text:
            score += 7
            hits.append(word)

    if "http://" in text or "https://" in text:
        score += 18
        hits.append("link")

    if any(word in text for word in ["now", "immediately", "final notice", "avoid", "prevent"]):
        score += 12
        hits.append("pressure language")

    if "$" in text or "gift card" in text:
        score += 13
        hits.append("money bait")

    return min(score, 99), hits


def llm_score(sender, body):
    prompt = f"""
You are a spam and scam detection assistant.

Analyze this text message.

Sender: {sender}
Message: {body}

Return only JSON like this:
{{
  "spam": true,
  "score": 0-99,
  "reason": "short reason"
}}
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You detect spam, scam, phishing, and suspicious SMS messages."},
            {"role": "user", "content": prompt}
        ],
        temperature=0
    )

    text = response.choices[0].message.content
    return json.loads(text)


@app.route("/api/check-spam", methods=["POST"])
def check_spam():
    data = request.json or {}

    sender = data.get("sender", "")
    body = data.get("body", "")

    local_result_score, hits = local_score(sender, body)

    if sender in contacts:
        return jsonify({
            "spam": False,
            "score": 0,
            "reason": "Sender is in contacts",
            "hits": hits
        })

    try:
        ai_result = llm_score(sender, body)
        final_score = max(local_result_score, ai_result["score"])

        return jsonify({
            "spam": final_score >= 70,
            "score": final_score,
            "reason": ai_result["reason"],
            "hits": hits
        })

    except Exception as e:
        return jsonify({
            "spam": local_result_score >= 70,
            "score": local_result_score,
            "reason": "Used local spam rules because AI failed",
            "hits": hits,
            "error": str(e)
        })


if __name__ == "__main__":
    app.run(port=5000, debug=True)