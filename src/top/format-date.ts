/** ISO の日時を、画面に出す日付にする（端末の時刻で）。読めなければ空 */
export const formatDateJa = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};
