import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { HttpError } from "@/lib/auth";

/** Wraps a route handler so HttpErrors become JSON responses and anything else a 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      console.error(err);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export function toObjectId(id: string, what = "item"): ObjectId {
  if (!ObjectId.isValid(id)) throw new HttpError(404, `No such ${what}.`);
  return new ObjectId(id);
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid request body.");
  }
}
