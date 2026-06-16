import { useEffect, useState } from "react";

/**
 * Trả về `value` sau khi đã "ổn định" trong `delay` ms — mỗi lần `value` đổi sẽ
 * hẹn lại đồng hồ. Dùng để gom các thay đổi gõ phím / kéo slider thành một lần
 * gọi server (vd ô tìm việc, chỉnh barem ở `JobPage`). `value` có thể là object;
 * hiệu lực dựa trên thay đổi danh tính (identity) giữa các lần render.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}
