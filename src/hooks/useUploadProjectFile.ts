import { useMutation } from "@tanstack/react-query";
import { fileExtension, type LocalFile } from "../lib/localFile";
import { uploadLocalFile } from "../lib/storageUpload";
import { useAuth } from "./useAuth";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // matches the 500MB private-content bucket limit

/**
 * Uploads a digital product file to the private-content bucket.
 * Unlike avatars/post-media, this bucket has NO public read policy —
 * the returned path is stored on the project row, and actual access
 * only ever happens through get-project-file, which mints a signed
 * URL after verifying purchase/ownership.
 */
export function useUploadProjectFile() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (file: LocalFile): Promise<string> => {
      if (!user) throw new Error("Not signed in");

      if (file.size > MAX_FILE_SIZE) {
        throw new Error("File must be under 500MB.");
      }

      const ext = fileExtension(file);
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      await uploadLocalFile("private-content", path, file);

      // Return the PATH, not a public URL — this bucket has no public
      // read policy, so there is no public URL. The path is what
      // get-project-file uses to mint a signed URL later.
      return path;
    },
  });
}
