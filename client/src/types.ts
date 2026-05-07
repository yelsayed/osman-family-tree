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
