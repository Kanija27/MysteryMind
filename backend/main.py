from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Literal, Optional
import json
import uuid
import logging
import os

from groq import Groq  # pip install groq
from dotenv import load_dotenv  # pip install python-dotenv

# ----------------- CONFIG -----------------

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY not set in environment or .env file")

# Fast, cheap model; you can change this if needed
GROQ_MODEL = "llama-3.1-8b-instant"

client = Groq(api_key=GROQ_API_KEY)

app = FastAPI()

@app.get("/")
async def root():
    return {
        "message": "MysteryMind API is running",
        "status": "online"
    }

# CORS so your React app can call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- SCHEMAS -----------------


class Suspect(BaseModel):
    name: str
    motive: str
    alibi: Optional[str] = None


class Location(BaseModel):
    id: str
    name: str
    description: str


class Clue(BaseModel):
    id: str
    name: str
    description: str
    location_id: Optional[str] = None


class Witness(BaseModel):
    name: str
    statement: str


class TimelineEvent(BaseModel):
    time: str
    description: str


class Case(BaseModel):
    case_id: str
    title: str
    victim: str
    crime_scene: str
    status: str = "Investigation Active"

    case_type: Literal[
        "murder", "theft", "missing_person", "museum", "hotel", "train"
    ]

    crime_scene_image: str

    locations: List[Location] = Field(default_factory=list)
    suspects: List[Suspect] = Field(default_factory=list)
    clues: List[Clue] = Field(default_factory=list)
    witnesses: List[Witness] = Field(default_factory=list)
    timeline: List[TimelineEvent] = Field(default_factory=list)

    culprit: str


class EvidenceCheckRequest(BaseModel):
    suspect: Suspect
    evidence_text: str
    case_id: str


class EvidenceCheckResponse(BaseModel):
    analysis: str


class InterrogateRequest(BaseModel):
    suspect_name: str
    motive: str
    alibi: Optional[str] = None
    question: str


class InterrogateResponse(BaseModel):
    answer: str


# ----------------- GROQ HELPERS -----------------


def call_groq_json(prompt: str) -> dict:
    """
    Call Groq chat completions and expect a JSON object in the content.
    """
    try:
        completion = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a JSON-only generator. "
                        "Always reply with a single valid JSON object and nothing else."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.7,
        )
    except Exception as e:
        logger.error(f"Groq request failed: {e}")
        raise HTTPException(status_code=500, detail=f"Groq error: {e}")

    content = completion.choices[0].message.content
    logger.info("Groq raw JSON response (truncated): %s", content[:200])

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse JSON from Groq: %s", e)
        raise HTTPException(status_code=500, detail=f"Invalid JSON from Groq: {e}")

    return data


def call_groq_text(prompt: str) -> str:
    """
    Simple text answer from Groq (for interrogation / evidence analysis).
    """
    try:
        completion = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are an AI assistant in a detective game.",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.7,
        )
    except Exception as e:
        logger.error(f"Groq request failed: {e}")
        raise HTTPException(status_code=500, detail=f"Groq error: {e}")

    content = completion.choices[0].message.content or ""
    return content.strip()


# ----------------- CASE GENERATION -----------------


def generate_case_with_groq() -> Case:
    prompt = """
You are a game content generator for a detective investigation video game.

TASK:
Create ONE self-contained mystery case as JSON.

CASE TYPES (randomly pick one each time you are called):
- murder
- theft
- missing_person
- museum
- hotel
- train

Constraints:
- The whole response MUST be a single JSON object, no extra text.
- Exactly 3 suspects.
- Exactly 3 clues.
- Exactly 3 distinct locations.
- Each clue must have a location_id that matches one of the locations' ids.
- culprit must be exactly one of the suspects' names.
- Always set status to "Investigation Active".
- case_type must be exactly one of:
  "murder", "theft", "missing_person", "museum", "hotel", "train".
- Keep every description to ONE short sentence (10–18 words).
- Avoid long paragraphs anywhere in the JSON.
- crime_scene_image should be a short identifier like "museum_vault_room" or "luxury_train_cabin".

JSON SHAPE EXACTLY:

{
  "case_id": "string",
  "title": "string",
  "victim": "string",
  "crime_scene": "string",
  "status": "Investigation Active",
  "case_type": "murder | theft | missing_person | museum | hotel | train",
  "crime_scene_image": "string",

  "locations": [
    {
      "id": "string",
      "name": "string",
      "description": "string"
    }
  ],

  "suspects": [
    {
      "name": "string",
      "motive": "string",
      "alibi": "string"
    }
  ],

  "clues": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "location_id": "string"
    }
  ],

  "witnesses": [
    {
      "name": "string",
      "statement": "string"
    }
  ],

  "timeline": [
    {
      "time": "string",
      "description": "string"
    }
  ],

  "culprit": "string"
}
"""

    data = call_groq_json(prompt)

    if "case_id" not in data or not data["case_id"]:
        data["case_id"] = f"CASE-{uuid.uuid4().hex[:8].upper()}"

    try:
        case = Case(**data)
    except Exception as e:
        logger.error("Case validation failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Case validation failed: {e}")

    return case


# ----------------- ROUTES -----------------


@app.get("/generate-case", response_model=Case)
async def generate_case():
    case = generate_case_with_groq()
    return case


@app.post("/check-evidence", response_model=EvidenceCheckResponse)
async def check_evidence(payload: EvidenceCheckRequest):
    prompt = f"""
You are an AI forensic assistant in a detective game.

Case ID: {payload.case_id}

Suspect:
- Name: {payload.suspect.name}
- Motive: {payload.suspect.motive}
- Alibi: {payload.suspect.alibi or "Unknown"}

Evidence:
\"\"\"{payload.evidence_text}\"\"\"


TASK:
In 1 to 3 sentences, explain to the player:

- How this evidence relates to the suspect.
- Whether it supports, weakens, or is neutral about their guilt.
- Any important details they should notice.

Use a clear, professional forensic tone.
Do NOT mention that you are an AI.
"""

    text = call_groq_text(prompt)
    if not text:
        text = "No forensic insight could be generated for this evidence."

    return EvidenceCheckResponse(analysis=text)


@app.post("/interrogate", response_model=InterrogateResponse)
async def interrogate(req: InterrogateRequest):
    prompt = f"""
You are roleplaying as a suspect in a detective game interrogation.

Suspect profile:
- Name: {req.suspect_name}
- Motive: {req.motive}
- Alibi: {req.alibi or "Unknown"}

Detective's question:
\"\"\"{req.question}\"\"\"


TASK:
Reply as this suspect would in one or two short paragraphs.
Maintain some tension: they should not confess instantly, but they may slip hints or show contradictions.
Avoid overexplaining the whole case.
"""

    text = call_groq_text(prompt)
    if not text:
        text = "The suspect stares in silence, refusing to answer."

    return InterrogateResponse(answer=text)