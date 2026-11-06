"use client";

import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { deleteOrderPhotos } from "./photo-actions";

export default function DeletePhotosButton({ orderId }: { orderId: string }) {
  return (
    <ActionForm action={deleteOrderPhotos}>
      <input type="hidden" name="id" value={orderId} />
      <SubmitButton className="btn-danger">Delete photos now</SubmitButton>
    </ActionForm>
  );
}
