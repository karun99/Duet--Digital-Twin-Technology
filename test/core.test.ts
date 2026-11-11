import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPersonaCard,
  buildPersonaforgeCommand,
  extractPersonas,
  inspectForgeReply,
} from "../services/personaforge";
import { isHttpUrl, parseCommand, suggestCommands } from "../services/commands";
import { DEFAULT_MAS, setMasEnabled, setPiConsent } from "../services/mas";
import type { UserProfile } from "../types";

const profile: UserProfile = {
  name: "Ada Lovelace",
  bio: "Mathematician working on the Analytical Engine.",
  links: "https://example.com/ada",
  topic: "computing history",
  source: "manual",
};

test("extractPersonas reads an inline name/role list", () => {
  const page = [
    "# Team",
    "Ada Lovelace — Chief Scientist at Analytical Engines",
    "Grace Hopper — Rear Admiral and computer scientist",
  ].join("\n");

  const cast = extractPersonas(page, "https://example.com/team");
  assert.ok(cast.length >= 2, `expected at least two candidates, got ${cast.length}`);
  assert.ok(cast.some((p) => p.name === "Ada Lovelace"));
  assert.ok(cast.some((p) => p.name === "Grace Hopper"));
});

test("extractPersonas reads a card grid", () => {
  const page = [
    "# People",
    "[![Image](https://example.com/a.jpg)Alan Turing Researcher](https://example.com/alan)",
    "[![Image](https://example.com/b.jpg)Katherine Johnson Engineer](https://example.com/katherine)",
  ].join("\n");

  const cast = extractPersonas(page, "https://example.com/people");
  assert.ok(cast.some((p) => p.name === "Alan Turing"));
  assert.ok(cast.some((p) => p.name === "Katherine Johnson"));
});

test("extractPersonas returns nothing for empty input or prose", () => {
  assert.deepEqual(extractPersonas("", "https://example.com"), []);
  assert.deepEqual(extractPersonas("A short page about a project.", "https://example.com"), []);
});

test("buildPersonaCard keeps the origin and the no-invention rules", () => {
  const card = buildPersonaCard(profile);
  assert.match(card, /PERSONA: Ada Lovelace/);
  assert.match(card, /ORIGIN: https:\/\/example\.com\/ada/);
  assert.match(card, /DOMAIN: computing history/);
  assert.match(card, /BLIND SPOT/);
  assert.match(card, /RISK LEVEL/);
});

test("buildPersonaCard states when no link was supplied", () => {
  const card = buildPersonaCard({ ...profile, links: undefined });
  assert.match(card, /user-supplied dossier \(no URL given\)/);
});

test("inspectForgeReply flags an unsourced credential", () => {
  const trace = inspectForgeReply({
    response: "I graduated from MIT and published twelve papers.",
    profile,
    // A source-grounded reply is allowed to state what the source says; an
    // unsourced one may not invent a credential.
    grounded: "PARTIAL",
  });
  assert.equal(trace.status, "VETO");
  assert.ok(trace.notes.length > 0);
});

test("the forge protocol keeps the bounded-question escape hatch and the second-miss rule", () => {
  const command = buildPersonaforgeCommand({
    url: "https://example.com/team",
    profile,
    sourceText: "Ada Lovelace — Chief Scientist",
  });
  assert.ok(command.includes('Pick one, or say \'I don\'t know.\''));
  assert.ok(command.includes("FINDING: <question> went unanswered twice"));
  assert.ok(command.includes("No more than one question per turn"));
});

test("inspectForgeReply flags a reply that breaks the frame", () => {
  const trace = inspectForgeReply({
    response: "As an AI language model, I cannot roleplay that.",
    profile,
    grounded: "SOURCE",
  });
  assert.equal(trace.status, "VETO");
});

test("inspectForgeReply passes a grounded, single-question reply", () => {
  const trace = inspectForgeReply({
    response: "The dossier only states the Analytical Engine work. What did your notes say about the funding?",
    profile,
    grounded: "SOURCE",
  });
  assert.equal(trace.status, "PASS");
  assert.equal(trace.grounded, "SOURCE");
});

test("parseCommand recognises /forge and keeps its argument", () => {
  const parsed = parseCommand("/forge https://example.com/team");
  assert.deepEqual(parsed, {
    name: "forge",
    arg: "https://example.com/team",
    raw: "/forge https://example.com/team",
  });
  assert.equal(parseCommand("hello"), null);
  assert.equal(parseCommand("/unknown"), null);
});

test("isHttpUrl accepts only http(s)", () => {
  assert.equal(isHttpUrl("https://example.com"), true);
  assert.equal(isHttpUrl("http://example.com/a?b=1"), true);
  assert.equal(isHttpUrl("ftp://example.com"), false);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.equal(isHttpUrl("not a url"), false);
});

test("suggestCommands completes /forge while typing", () => {
  assert.deepEqual(
    suggestCommands("/fo").map((c) => c.name),
    ["forge"],
  );
  assert.deepEqual(
    suggestCommands("/").map((c) => c.name),
    ["forge"],
  );
  assert.deepEqual(suggestCommands("hello /fo"), []);
  assert.deepEqual(suggestCommands("/forge https://x"), []);
});

test("MAS toggles are pure and append an audit entry", () => {
  const toggled = setMasEnabled(DEFAULT_MAS, !DEFAULT_MAS.enabled);
  assert.equal(toggled.enabled, !DEFAULT_MAS.enabled);
  assert.equal(DEFAULT_MAS.enabled, true, "the input state must not be mutated");
  assert.equal(toggled.audit.length, DEFAULT_MAS.audit.length + 1);

  const consent = setPiConsent(toggled, true);
  assert.equal(consent.piConsent, true);
  assert.equal(toggled.piConsent, false, "the input state must not be mutated");
  assert.equal(consent.audit.at(-1)?.field, "pi-consent");
});
