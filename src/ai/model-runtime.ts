import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { z } from "zod";

import { env } from "../config/env.js";

export const summaryOutputSchema = z.object({
  summary: z.string(),
  relevantPoints: z.array(z.string()),
  pendingItems: z.array(z.string()),
  explicitAlerts: z.array(z.string()),
  sourceNoteIds: z.array(z.string().uuid())
}).strict();

export const answerOutputSchema = z.object({
  status: z.enum(["supported", "insufficient_information"]),
  answer: z.string(),
  sourceNoteIds: z.array(z.string().uuid())
}).strict();

export type SummaryOutput = z.output<typeof summaryOutputSchema>;
export type AnswerOutput = z.output<typeof answerOutputSchema>;

export interface AiModelRuntime {
  embed(texts: string[]): Promise<number[][]>;
  generateSummary(prompt: string): Promise<SummaryOutput>;
  generateAnswer(prompt: string): Promise<AnswerOutput>;
}

export function createAiModelRuntime(): AiModelRuntime {
  return env.AI_RUNTIME === "local" ? new CommandModelRuntime() : new MockModelRuntime();
}

class CommandModelRuntime implements AiModelRuntime {
  embed(texts: string[]) {
    return runJsonCommand(
      env.AI_EMBEDDING_COMMAND,
      { model: env.AI_EMBEDDING_MODEL_ID, texts },
      z.array(z.array(z.number()).length(384))
    );
  }

  generateSummary(prompt: string) {
    return runJsonCommand(
      env.AI_GENERATION_COMMAND,
      { model: env.AI_GENERATION_MODEL_ID, task: "summary", prompt },
      summaryOutputSchema
    );
  }

  generateAnswer(prompt: string) {
    return runJsonCommand(
      env.AI_GENERATION_COMMAND,
      { model: env.AI_GENERATION_MODEL_ID, task: "answer", prompt },
      answerOutputSchema
    );
  }
}

class MockModelRuntime implements AiModelRuntime {
  async embed(texts: string[]) {
    return texts.map(deterministicEmbedding);
  }

  async generateSummary(_prompt: string): Promise<SummaryOutput> {
    return {
      summary: "Resumen ficticio generado por el runtime de pruebas.",
      relevantPoints: [],
      pendingItems: [],
      explicitAlerts: [],
      sourceNoteIds: []
    };
  }

  async generateAnswer(_prompt: string): Promise<AnswerOutput> {
    return {
      status: "insufficient_information",
      answer: "No hay evidencia suficiente en las notas disponibles.",
      sourceNoteIds: []
    };
  }
}

async function runJsonCommand<T>(
  command: string,
  input: unknown,
  schema: z.ZodType<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderrLength = 0;
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("AI_RUNTIME_TIMEOUT"));
    }, env.AI_JOB_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (value: string) => {
      stdout += value;
      if (stdout.length > 2_000_000) child.kill();
    });
    child.stderr.on("data", (value: Buffer) => {
      stderrLength += value.length;
    });
    child.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("AI_RUNTIME_START_FAILED"));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`AI_RUNTIME_FAILED_${code ?? "UNKNOWN"}_${stderrLength}`));
        return;
      }
      try {
        resolve(schema.parse(JSON.parse(stdout)));
      } catch {
        reject(new Error("AI_RUNTIME_INVALID_OUTPUT"));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function deterministicEmbedding(text: string): number[] {
  const values: number[] = [];
  let counter = 0;
  while (values.length < 384) {
    const digest = createHash("sha256").update(`${counter}:${text}`).digest();
    for (const byte of digest) {
      values.push((byte - 127.5) / 127.5);
      if (values.length === 384) break;
    }
    counter += 1;
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return values.map((value) => value / norm);
}
