import { useEffect, useState } from "react";

type SellerProductImageProps = {
  src: string | null | undefined;
  title: string;
  size?: "thumbnail" | "market";
};

export function SellerProductImage({ src, title, size = "thumbnail" }: SellerProductImageProps) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  return (
    <span className={`seller-product-image seller-product-image-${size}`}>
      {failed ? (
        <span role="img" aria-label={`${title} image unavailable`}>No image</span>
      ) : (
        <img src={src ?? undefined} alt="" onError={() => setFailed(true)} />
      )}
    </span>
  );
}
