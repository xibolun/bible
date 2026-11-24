package importer

import (
	"bufio"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"os"
)

// A gzip stream wraps exactly one resource. Do not trust ISIZE, header filenames
// or the extension: browsers may already have decoded HTTP Content-Encoding.
func unpackGZIP(ctx context.Context, in io.Reader, dir string, limit int64) (string, string, error) {
	buffered := bufio.NewReader(&contextReader{ctx, in})
	z, err := gzip.NewReader(buffered)
	if err != nil {
		if ctx.Err() != nil {
			return "", "", ctx.Err()
		}
		return "", "", fail("INVALID_CONTENT", "GZIP header")
	}
	defer z.Close()
	z.Multistream(false)
	out, err := os.CreateTemp(dir, "unpacked-*")
	if err != nil {
		return "", "", err
	}
	keep := false
	defer func() {
		_ = out.Close()
		if !keep {
			_ = os.Remove(out.Name())
		}
	}()
	size, readErr := io.Copy(out, io.LimitReader(&contextReader{ctx, z}, limit+1))
	closeErr := out.Close()
	if ctx.Err() != nil {
		return "", "", ctx.Err()
	}
	if size > limit {
		return "", "", fail("IMPORT_LIMIT", "GZIP resource")
	}
	// Reading through EOF checks the trailer CRC and catches truncated streams.
	if readErr != nil {
		var pathErr *os.PathError
		if errors.As(readErr, &pathErr) || errors.Is(readErr, io.ErrShortWrite) {
			return "", "", readErr
		}
		return "", "", fail("INVALID_CONTENT", "GZIP checksum or truncated stream")
	}
	if closeErr != nil {
		return "", "", closeErr
	}
	if _, err = buffered.Peek(1); err != io.EOF {
		if ctx.Err() != nil {
			return "", "", ctx.Err()
		}
		if err != nil {
			return "", "", err
		}
		return "", "", fail("FORMAT_AMBIGUOUS", "multiple GZIP members or trailing data")
	}
	keep = true
	return out.Name(), z.Name, nil
}
