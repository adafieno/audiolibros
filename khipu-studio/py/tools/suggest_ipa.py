#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Suggest IPA transcription for a single word using the project's LLM.
Prints a single JSON line: {"ipa": "..."}
"""
import argparse
import json
import os
import sys
from pathlib import Path
import unicodedata

# Ensure stdout/stderr use UTF-8 when running under environments that
# default to a narrow encoding (Windows 'charmap'). This avoids
# UnicodeEncodeError when printing IPA containing combining marks.
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    # Best effort; if it fails, prints may still error later and be caught
    pass


def load_project_cfg(project_root: Path):
    p = project_root / "project.khipu.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def set_env_from_project(cfg: dict):
    # Support openai creds and azureOpenAI
    try:
        creds = cfg.get("creds", {}).get("llm", {})
        openai = creds.get("openai") or {}
        azure = creds.get("azureOpenAI") or {}
        # Prefer explicit Azure creds when engine indicates azure-openai
        if azure.get("apiKey"):
            os.environ.setdefault(
                "OPENAI_API_KEY", azure.get("apiKey") or ""
            )
            if azure.get("endpoint"):
                os.environ.setdefault(
                    "OPENAI_BASE_URL", azure.get("endpoint") or ""
                )
            if azure.get("apiVersion"):
                os.environ.setdefault(
                    "OPENAI_API_VERSION", azure.get("apiVersion") or ""
                )
        else:
            if openai.get("apiKey"):
                os.environ.setdefault(
                    "OPENAI_API_KEY", openai.get("apiKey") or ""
                )
            if openai.get("baseUrl"):
                os.environ.setdefault(
                    "OPENAI_BASE_URL", openai.get("baseUrl") or ""
                )
    except Exception:
        pass


def load_local_table(language: str | None = None):
    resources_dir = Path(__file__).resolve().parents[1] / "resources"
    default_p = resources_dir / "ipa_table.json"
    table: dict = {}
    try:
        if default_p.exists():
            table = json.loads(default_p.read_text(encoding="utf-8") or "{}")
    except Exception:
        table = {}

    # If a language/locale is provided, try more specific tables that
    # override the defaults. Examples: ipa_table.en-US.json, ipa_table.en.json
    if language:
        tried = []
        # candidate: full locale e.g. en-US
        tried.append(language)
        # candidate: primary language e.g. en
        if "-" in language:
            tried.append(language.split("-")[0])
        for cand in tried:
            try:
                fname = f"ipa_table.{cand}.json"
                p = resources_dir / fname
                if p.exists():
                    try:
                        extra = json.loads(
                            p.read_text(encoding="utf-8") or "{}"
                        )
                        if isinstance(extra, dict):
                            table.update(extra)
                    except Exception:
                        pass
            except Exception:
                pass
    return table



def extract_candidate(resp_text: str) -> str:
    if not resp_text:
        return ""
    s = resp_text.strip()
    # If the model returns something like `/fəˈnɛtɪk/` or [fəˈnɛtɪk],
    # extract inner
    if s.startswith("/") and s.endswith("/") and len(s) > 2:
        return s[1:-1].strip()
    if s.startswith("[") and s.endswith("]") and len(s) > 2:
        return s[1:-1].strip()
    # Try to find a substring between slashes
    import re
    m = re.search(r"/([^/]+)/", s)
    if m:
        return m.group(1).strip()
    # Otherwise, if there are multiple lines, take the first non-empty line
    for line in s.splitlines():
        if line.strip():
            return line.strip()
    return s


def transliterate_word(word: str, table: dict) -> tuple[str, list[str]]:
    """
    Deterministically transliterate `word` using `table`.
    The table keys may include underscores to denote multiple alternative
    grapheme tokens (e.g. "gue_gui" -> tokens "gue" and "gui"). We build
    a token->entry map and perform a greedy longest-match scan across the
    input word. Returns (ipa_string, examples_list).
    """
    if not word or not table:
        return "", []
    w = word.lower()

    # Build token map: token -> entry (ipa, examples)
    # and a list of context rules for patterns like 'c_ei' meaning
    # 'c' before 'e' or 'i' -> some ipa.
    token_map: dict = {}
    context_rules: list[dict] = []
    for k, v in table.items():
        if "_" in k:
            parts = k.split("_")
            # If all parts are multi-char tokens, register each as a token
            if all(len(p) > 1 for p in parts):
                for part in parts:
                    token_map[part.lower()] = v
            else:
                # Try to interpret as a context rule like 'c_ei' -> base 'c', lookaheads ['e','i']
                # We support pattern: base_single + suffix_string (letters concatenated)
                if len(parts) == 2 and len(parts[0]) == 1 and len(parts[1]) >= 1:
                    base = parts[0].lower()
                    # If suffix is multiple letters like 'ei', treat as separate lookaheads
                    lookaheads = list(parts[1])
                    context_rules.append({
                        "base": base,
                        "lookaheads": lookaheads,
                        "entry": v,
                    })
                else:
                    # Fallback: register full key as token
                    token_map[k.lower()] = v
        else:
            token_map[k.lower()] = v

    # Prepare tokens sorted by length desc for greedy matching
    tokens = sorted(token_map.keys(), key=lambda x: -len(x))
    # Quick debug for 'c' mapping when requested
    try:
        if os.environ.get("SUGGEST_IPA_DEBUG"):
            info = {"c_mapping": token_map.get("c"), "tokens_sample": tokens[:20]}
            if hasattr(sys.stderr, "buffer"):
                sys.stderr.buffer.write((json.dumps(info, ensure_ascii=False) + "\n").encode("utf-8"))
                sys.stderr.buffer.flush()
            else:
                print(info, file=sys.stderr, flush=True)
    except Exception:
        pass

    i = 0
    out_pieces = []
    examples = []
    while i < len(w):
        matched = False
        for t in tokens:
            if w.startswith(t, i):
                entry = token_map.get(t)
                ipa_piece = None
                exs = None
                if isinstance(entry, str):
                    ipa_piece = entry
                elif isinstance(entry, dict):
                    ipa_piece = entry.get("ipa")
                    exs = entry.get("examples")
                if ipa_piece is None:
                    # treat as empty (silent) and continue
                    ipa_piece = ""
                out_pieces.append(ipa_piece)
                if exs:
                    if isinstance(exs, (list, tuple)):
                        examples.extend([str(x) for x in exs])
                    else:
                        examples.append(str(exs))
                i += len(t)
                matched = True
                break
        if matched:
            continue

        # Context rules: check for a base char that has special mapping when
        # followed by specific lookahead letters (e.g. c before e or i)
        base_ch = w[i]
        applied_ctx = False
        for rule in context_rules:
            if base_ch == rule.get("base"):
                # check lookaheads
                for la in rule.get("lookaheads", []):
                    if w.startswith(la, i + 1):
                        entry = rule.get("entry")
                        if isinstance(entry, str):
                            ipa_piece = entry
                            exs = None
                        else:
                            ipa_piece = entry.get("ipa") or ""
                            exs = entry.get("examples")
                        out_pieces.append(ipa_piece)
                        if exs:
                            if isinstance(exs, (list, tuple)):
                                examples.extend([str(x) for x in exs])
                            else:
                                examples.append(str(exs))
                        i += 1  # consume only base char
                        applied_ctx = True
                        break
                if applied_ctx:
                    break
        if applied_ctx:
            continue
        if not matched:
            # If no token matched at position i, consume one character
            # and attempt to transliterate it via a single-char fallback
            ch = w[i]
            entry = token_map.get(ch)
            if entry is not None:
                if isinstance(entry, str):
                    ipa_piece = entry
                    exs = None
                else:
                    ipa_piece = entry.get("ipa") or ""
                    exs = entry.get("examples")
                out_pieces.append(ipa_piece)
                if exs:
                    if isinstance(exs, (list, tuple)):
                        examples.extend([str(x) for x in exs])
                    else:
                        examples.append(str(exs))
            else:
                # Unknown grapheme: append the raw character as a best-effort
                out_pieces.append(ch)
            i += 1

    ipa = "".join(out_pieces).strip()
    # Deduplicate examples preserving order
    seen = set()
    uniq_examples = []
    for e in examples:
        if e not in seen:
            seen.add(e)
            uniq_examples.append(e)
    return ipa, uniq_examples


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project-root", required=True)
    ap.add_argument("--word", required=True)
    ap.add_argument("--force", action="store_true", help="Bypass project-level overrides and force table/LLM lookup")
    args = ap.parse_args()

    project_root = Path(args.project_root)
    cfg = load_project_cfg(project_root)
    set_env_from_project(cfg)

    # Build prompt: prefer explicit book.meta.json language when available
    proj_language = cfg.get("language") or ""
    paths_cfg = cfg.get("paths", {}) or {}
    book_meta_rel = paths_cfg.get("bookMeta") or "book.meta.json"
    book_meta_path = project_root / book_meta_rel
    book_locale = ""
    try:
        if book_meta_path.exists():
            bm = json.loads(
                book_meta_path.read_text(encoding="utf-8") or "{}"
            )
            book_locale = bm.get("language") or ""
    except Exception:
        book_locale = ""
    language = book_locale or proj_language or ""

    # First consult project-level overrides (may be a string or an object)
    # Respect the --force flag to optionally bypass project overrides.
    proj_map = cfg.get("pronunciationMap") or {}
    if not args.force and isinstance(proj_map, dict):
        val = proj_map.get(args.word)
        if val:
            ipa_val = None
            examples = None
            if isinstance(val, str):
                ipa_val = val
            elif isinstance(val, dict):
                ipa_val = val.get("ipa")
                examples = val.get("examples")
            if ipa_val:
                payload = {"ipa": ipa_val, "source": "project"}
                if examples:
                    payload["examples"] = examples
                out = json.dumps(payload, ensure_ascii=False)
                if hasattr(sys.stdout, "buffer"):
                    sys.stdout.buffer.write((out + "\n").encode("utf-8"))
                    sys.stdout.buffer.flush()
                else:
                    print(out, flush=True)
                return

    # If no explicit language was found, try to infer from the word itself
    # (accents and 'ñ' are a good heuristic for Spanish). If we infer a
    # language, reload the local table with that locale so locale-specific
    # mappings like 'c' -> 'k' for Spanish are available.
    if not language:
        try:
            import re
            if re.search(r"[ñÑáÁéÉíÍóÓúÚüÜ]", args.word):
                language = "es"
        except Exception:
            pass

    # Next consult local IPA table (allow locale-specific overrides)
    table = load_local_table(language)
    if table and isinstance(table, dict):
        val = table.get(args.word)
        if val:
            ipa_val = None
            examples = None
            if isinstance(val, str):
                ipa_val = val
            elif isinstance(val, dict):
                ipa_val = val.get("ipa")
                examples = val.get("examples")
            if ipa_val:
                payload = {"ipa": ipa_val, "source": "table"}
                if examples:
                    payload["examples"] = examples
                out = json.dumps(payload, ensure_ascii=False)
                if hasattr(sys.stdout, "buffer"):
                    sys.stdout.buffer.write((out + "\n").encode("utf-8"))
                    sys.stdout.buffer.flush()
                else:
                    print(out, flush=True)
                return

    # Attempt deterministic transliteration using grapheme rules from the
    # local table. This handles arbitrary words (not only exact table keys)
    # and avoids calling the LLM when a full transliteration can be built.
    try:
        t_ipa, t_examples = transliterate_word(args.word, table or {})
        # If transliteration produced a result but it's identical to the
        # input (no mappings applied) and we don't have a language, try
        # re-running transliteration with the Spanish table as a fallback
        # because many Spanish words (like 'encanto') don't contain
        # accent marks but should use Spanish grapheme rules.
        if t_ipa and str(t_ipa).strip():
            payload = {"ipa": t_ipa, "source": "table"}
            if t_examples:
                payload["examples"] = t_examples
            # If result equals the original word and language was not set,
            # attempt a Spanish transliteration pass and prefer it if it
            # yields a changed/meaningful IPA.
            try:
                if not language:
                    t_es_table = load_local_table("es")
                    t2_ipa, t2_examples = transliterate_word(args.word, t_es_table or {})
                    if t2_ipa and t2_ipa.strip() and t2_ipa.strip().lower() != str(args.word).strip().lower():
                        payload = {"ipa": t2_ipa, "source": "table"}
                        if t2_examples:
                            payload["examples"] = t2_examples
                        out = json.dumps(payload, ensure_ascii=False)
                        if hasattr(sys.stdout, "buffer"):
                            sys.stdout.buffer.write((out + "\n").encode("utf-8"))
                            sys.stdout.buffer.flush()
                        else:
                            print(out, flush=True)
                        return
            except Exception:
                pass

            out = json.dumps(payload, ensure_ascii=False)
            if hasattr(sys.stdout, "buffer"):
                sys.stdout.buffer.write((out + "\n").encode("utf-8"))
                sys.stdout.buffer.flush()
            else:
                print(out, flush=True)
            return
    except Exception:
        # If transliteration fails for any reason, fall through to LLM
        pass

    system = (
        "You are a concise expert phonetics assistant. Given a single word "
        "and an optional language/locale, respond with only the IPA "
        "transcription for that word. Do NOT include explanations, markup, "
        "or additional text—only the IPA characters. If unsure, return "
        "an empty string. Use the IPA standard for the language when "
        "possible."
    )

    user = (
        f"Provide the IPA transcription (only the IPA) for the single word: "
        f"\"{args.word}\". "
        f"Book locale: {language}. "
        f"If book locale is empty, use locale inferred from the word. "
        f"Respond with a single short line containing only the IPA. "
        f"Do not include explanations or extra text."
    )

    try:
        # Ensure the project's `py` package directory is on sys.path so
        # `import dossier.client` works even when this script is run directly.
        try:
            py_dir = Path(__file__).resolve().parents[1]
            if str(py_dir) not in sys.path:
                sys.path.insert(0, str(py_dir))
        except Exception:
            pass

        # Import the project's LLM client (dossier.client) which respects
        # environment variables
        from dossier.client import chat_text

        # Build a concise rules block from the local table to give the LLM
        # authoritative grapheme->IPA mappings to reference.
        rules = ""
        try:
            if table and isinstance(table, dict):
                # Sort keys by length desc so multi-char graphemes appear first
                keys = sorted(list(table.keys()), key=lambda k: -len(k))
                lines = []
                for k in keys:
                    v = table.get(k)
                    ipa_v = None
                    if isinstance(v, str):
                        ipa_v = v
                    elif isinstance(v, dict):
                        ipa_v = v.get("ipa")
                    if ipa_v:
                        lines.append(f"{k} -> {ipa_v}")
                if lines:
                    rules = "Grapheme to IPA rules:\n" + "\n".join(lines)
        except Exception:
            rules = ""

        messages = []
        # If we have rules, include them as an additional system message so the
        # model treats them as authoritative guidance.
        if rules:
            messages.append({"role": "system", "content": rules})
        messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": user})

        # Use a low max_tokens and temperature 0 for deterministic short answer
        try:
            model = None
            pr_llm = cfg.get("llm", {}).get("engine") or {}
            if isinstance(pr_llm, dict):
                model = pr_llm.get("model")
            # chat_text signature: chat_text(messages, *, model=None,
            # temperature=None, max_tokens=None)
            resp = chat_text(
                messages, model=model, temperature=0.0, max_tokens=80
            )
            # Debug: echo raw LLM response to stderr so main process logs it
            try:
                # Write raw LLM reply as UTF-8 bytes to stderr buffer to avoid
                # UnicodeEncodeError on Windows consoles with 'charmap'.
                if hasattr(sys.stderr, "buffer"):
                    try:
                        data = ("[LLM-RAW] " + resp + "\n").encode("utf-8")
                        sys.stderr.buffer.write(data)
                        sys.stderr.buffer.flush()
                    except Exception:
                        pass
                else:
                    # Fallback to normal print if no buffer available
                    try:
                        print("[LLM-RAW] " + resp, file=sys.stderr, flush=True)
                    except Exception:
                        pass
            except Exception:
                pass
        except Exception as e:
            try:
                out = json.dumps(
                    {"ipa": "", "error": f"llm_call_failed: {e}"},
                    ensure_ascii=False,
                )
                if hasattr(sys.stdout, "buffer"):
                    sys.stdout.buffer.write((out + "\n").encode("utf-8"))
                    sys.stdout.buffer.flush()
                else:
                    print(out, flush=True)
            except Exception:
                pass
            return
        # If we reach here, chat_text succeeded and `resp` contains the raw
        # model reply. Extract the IPA candidate from the response.
        ipa = extract_candidate(resp)
        # Sanitize: remove surrounding quotes/backticks and whitespace
        ipa = ipa.strip().strip('"').strip("'").strip()
        # Normalize to NFC so composed characters are consistent
        try:
            ipa = unicodedata.normalize("NFC", ipa)
        except Exception:
            pass
        # Remove control/format characters (e.g. ZERO WIDTH SPACE, etc.)
        try:
            pieces = []
            for ch in ipa:
                if not unicodedata.category(ch).startswith("C"):
                    pieces.append(ch)
            ipa = "".join(pieces)
        except Exception:
            pass
        if not ipa:
            # No IPA extracted — return an explicit error with raw model reply
            try:
                out = json.dumps(
                    {"ipa": "", "error": "no_ipa_found", "raw": resp},
                    ensure_ascii=False,
                )
                if hasattr(sys.stdout, "buffer"):
                    sys.stdout.buffer.write((out + "\n").encode("utf-8"))
                    sys.stdout.buffer.flush()
                else:
                    print(out, flush=True)
            except Exception:
                pass
            return
        try:
            out = json.dumps({"ipa": ipa, "source": "llm"}, ensure_ascii=False)
            if hasattr(sys.stdout, "buffer"):
                sys.stdout.buffer.write((out + "\n").encode("utf-8"))
                sys.stdout.buffer.flush()
            else:
                print(out, flush=True)
        except Exception:
            pass
    except Exception as e:
        try:
            out = json.dumps(
                {"ipa": "", "error": f"exception: {e}"},
                ensure_ascii=False,
            )
            if hasattr(sys.stdout, "buffer"):
                sys.stdout.buffer.write((out + "\n").encode("utf-8"))
                sys.stdout.buffer.flush()
            else:
                print(out, flush=True)
        except Exception:
            pass


if __name__ == "__main__":
    main()
