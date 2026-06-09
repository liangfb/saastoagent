import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extract a human-readable message from an unknown thrown value. */
export function getErrorMessage(err: unknown, fallback = "Unexpected error"): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  return fallback
}

/** Unwrap a paginated list response (`{ items: T[] }`) into its items array. */
export function itemsOf<T>(data: unknown): T[] {
  if (data && typeof data === "object" && "items" in data) {
    const items = (data as { items?: unknown }).items
    if (Array.isArray(items)) return items as T[]
  }
  return []
}
