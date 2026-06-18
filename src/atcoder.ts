type ContestHistory = {
  IsRated: boolean;
  NewRating: number;
  OldRating: number;
  Performance: number;
  ContestName: string;
  EndTime: string;
};

export type UserRating = {
  rating: number;
  highestRating: number;
  ratedCount: number;
};

export const fetchUserRating = async (atcoderId: string): Promise<UserRating | null> => {
  const res = await fetch(`https://atcoder.jp/users/${atcoderId}/history/json`);
  if (!res.ok) return null;

  const history: ContestHistory[] = await res.json();
  const rated = history.filter((h) => h.IsRated);
  if (rated.length === 0) return null;

  const latest = rated[rated.length - 1];
  const highestRating = Math.max(...rated.map((h) => h.NewRating));

  return {
    rating: latest.NewRating,
    highestRating,
    ratedCount: rated.length,
  };
};

export const ratingToColor = (rating: number): string => {
  if (rating >= 2800) return '赤';
  if (rating >= 2400) return 'オレンジ';
  if (rating >= 2000) return '黄';
  if (rating >= 1600) return '青';
  if (rating >= 1200) return '水';
  if (rating >= 800) return '緑';
  if (rating >= 400) return '茶';
  return '灰';
};
