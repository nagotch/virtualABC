import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

type UserMap = Record<string, string>; // traqId -> atcoderId

const DATA_FILE = 'data/users.json';

const load = (): UserMap => {
  if (!existsSync(DATA_FILE)) return {};
  return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
};

const save = (data: UserMap) => {
  mkdirSync('data', { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

export const registerUser = (traqId: string, atcoderId: string) => {
  const data = load();
  data[traqId] = atcoderId;
  save(data);
};

export const getAtcoderId = (traqId: string): string | undefined => {
  return load()[traqId];
};
