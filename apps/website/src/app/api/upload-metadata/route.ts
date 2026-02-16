import { NextRequest, NextResponse } from "next/server";

const PINATA_API = "https://api.pinata.cloud";

export async function POST(req: NextRequest) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json(
      { error: "PINATA_JWT not configured" },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const name = formData.get("name") as string;
    const symbol = formData.get("symbol") as string;
    const description = formData.get("description") as string;
    const image = formData.get("image") as File | null;

    if (!name || !symbol) {
      return NextResponse.json(
        { error: "name and symbol are required" },
        { status: 400 }
      );
    }

    // 1. Upload image to Pinata (if provided)
    let imageUri = "";
    if (image && image.size > 0) {
      const imgForm = new FormData();
      imgForm.append("file", image);
      imgForm.append(
        "pinataMetadata",
        JSON.stringify({ name: `${symbol}-image` })
      );

      const imgRes = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: imgForm,
      });

      if (!imgRes.ok) {
        const err = await imgRes.text();
        return NextResponse.json(
          { error: `Image upload failed: ${err}` },
          { status: 502 }
        );
      }

      const imgData = await imgRes.json();
      imageUri = `https://ipfs.io/ipfs/${imgData.IpfsHash}`;
    }

    // 2. Construct Metaplex-compatible metadata JSON
    const metadata = {
      name,
      symbol,
      description: description || "",
      image: imageUri,
      properties: {
        category: "experiment",
      },
    };

    // 3. Upload metadata JSON to Pinata
    const metaRes = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: { name: `${symbol}-metadata` },
      }),
    });

    if (!metaRes.ok) {
      const err = await metaRes.text();
      return NextResponse.json(
        { error: `Metadata upload failed: ${err}` },
        { status: 502 }
      );
    }

    const metaData = await metaRes.json();
    const uri = `https://ipfs.io/ipfs/${metaData.IpfsHash}`;

    return NextResponse.json({ uri, imageUri });
  } catch (err) {
    console.error("Upload metadata error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
