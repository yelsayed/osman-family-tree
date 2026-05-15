export interface PhotoUrls {
  /** 96×96 cover crop. Used on the tree node card. */
  thumb: string;
  /** 256×256 cover crop. Used in the edit drawer preview / any info section. */
  medium: string;
  /** Long edge ≤ 2048, no crop. Shown when the user clicks to expand. */
  original: string;
}

export type PhotoVariant = keyof PhotoUrls;

export interface FamilyNode {
  id: number;
  parentId: number | null;
  name: string;
  sex: 'male' | 'female';
  /** ISO date string (YYYY-MM-DD), or null if unknown. */
  born: string | null;
  /** ISO date string (YYYY-MM-DD), or null if alive / unknown. */
  died: string | null;
  bio: string;
  email: string;
  /**
   * Opaque base storage key for the profile picture. The client never reads or
   * constructs this — it's here only because the server echoes it back
   * alongside `photoUrls` on writes.
   */
  photoKey?: string;
  /**
   * Server-derived URL map for the profile picture, one per variant.
   * `null` (or absent) when no picture has been uploaded.
   */
  photoUrls?: PhotoUrls | null;
}

export type NodeFormState = {
  parentId?: number | null;
  name: string;
  sex: 'male' | 'female';
  /** YYYY-MM-DD as produced by <input type="date">, or empty string. */
  born: string;
  died: string;
  bio: string;
  email: string;
};
