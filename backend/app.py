import os
import json
import re
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

spam_signals = {
    "urgent": 8,
    "verify": 10,
    "password": 12,
    "account": 8,
    "winner": 14,
    "claim": 10,
    "prize": 12,
    "refund": 9,
    "gift": 8,
    "gift card": 16,
    "crypto": 14,
    "fee": 8,
    "package": 6,
    "delivery": 5,
    "tap": 6
}


@app.route("/")
def home():
    return "Spam Silencer Python Backend Running"


def normalize_phone(value):
    return re.sub(r"\D", "", value)


def is_contact(sender):
    sender_clean = sender.strip().lower()
    sender_digits = normalize_phone(sender)

    for contact in contacts:
        contact_clean = contact.strip().lower()
        contact_digits = normalize_phone(contact)

        if sender_clean == contact_clean:
            return True

        if sender_digits and contact_digits and sender_digits == contact_digits:
            return True

    return False


def local_score(sender, body):
    text = f"{sender} {body}".lower()
    score = 0
    hits = []

    trusted_contact = is_contact(sender)

    if trusted_contact:
        score -= 25
        hits.append("known contact")

    for word, points in spam_signals.items():
        if word in text:
            score += points
            hits.append(word)

    if "http://" in text or "https://" in text:
        score += 22
        hits.append("suspicious link")

    if any(word in text for word in ["now", "immediately", "final notice", "avoid", "prevent"]):
        score += 14
        hits.append("pressure language")

    if "$" in text or "gift card" in text:
        score += 18
        hits.append("money bait")

    if any(word in text for word in ["bank", "login", "locked", "suspended", "unusual activity"]):
        score += 16
        hits.append("account security warning")

    if any(word in text for word in ["ssn", "social security", "credit card", "routing number"]):
        score += 25
        hits.append("sensitive information request")

    if trusted_contact:
        score = min(score, 45)

    return max(0, min(score, 99)), hits


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

Rules:
- If the sender is a known contact, the score should usually be low unless the message is clearly dangerous.
- Links, money bait, account verification, pressure language, and requests for personal information should raise the score.
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You detect spam, scam, phishing, and suspicious SMS messages."},
            {"role": "user", "content": prompt}
        ],
        temperature=0
    )

    text = response.choices[0].message.content.strip()
    text = text.replace("```json", "").replace("```", "").strip()
    return json.loads(text)


@app.route("/api/check-spam", methods=["POST"])
def check_spam():
    data = request.json or {}

    sender = data.get("sender", "")
    body = data.get("body", "")

    local_result_score, hits = local_score(sender, body)
    trusted_contact = is_contact(sender)

    try:
        ai_result = llm_score(sender, body)
        ai_score = int(ai_result.get("score", 0))

        if trusted_contact:
            final_score = min(max(local_result_score, ai_score - 25), 45)
            reason = "Sender is in contacts, so risk was lowered. " + ai_result.get("reason", "")
        else:
            final_score = max(local_result_score, ai_score)
            reason = ai_result.get("reason", "Analyzed message for spam risk.")

        return jsonify({
            "spam": final_score >= 70,
            "score": final_score,
            "reason": reason,
            "hits": hits,
            "trustedContact": trusted_contact
        })

    except Exception as e:
        return jsonify({
            "spam": local_result_score >= 70,
            "score": local_result_score,
            "reason": "Used local spam rules because AI failed",
            "hits": hits,
            "trustedContact": trusted_contact,
            "error": str(e)
        })


if __name__ == "__main__":
    app.run(port=5000, debug=True)