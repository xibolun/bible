package importer

import (
	"bufio"
	"encoding/binary"
	"html"
	"io"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

func textReader(in io.Reader) (io.Reader, error) {
	r := bufio.NewReader(in)
	b, _ := r.Peek(3)
	if len(b) >= 3 && string(b[:3]) == "\xef\xbb\xbf" {
		_, _ = r.Discard(3)
	}
	if len(b) >= 2 && (string(b[:2]) == "\xff\xfe" || string(b[:2]) == "\xfe\xff") {
		_, _ = r.Discard(2)
		var order binary.ByteOrder = binary.LittleEndian
		if b[0] == 0xfe {
			order = binary.BigEndian
		}
		return &utf16Stream{r: r, order: order}, nil
	}
	return r, nil
}

type utf16Stream struct {
	r       *bufio.Reader
	order   binary.ByteOrder
	pending []byte
}

func (r *utf16Stream) Read(out []byte) (int, error) {
	if len(out) == 0 {
		return 0, nil
	}
	if len(r.pending) == 0 {
		var b [2]byte
		n, err := io.ReadFull(r.r, b[:])
		if err != nil {
			if err == io.EOF && n == 0 {
				return 0, io.EOF
			}
			return 0, fail("ENCODING_UNSUPPORTED", "UTF-16")
		}
		u := r.order.Uint16(b[:])
		ch := rune(u)
		if u >= 0xd800 && u <= 0xdbff {
			if _, err = io.ReadFull(r.r, b[:]); err != nil {
				return 0, fail("ENCODING_UNSUPPORTED", "UTF-16 surrogate")
			}
			low := r.order.Uint16(b[:])
			if low < 0xdc00 || low > 0xdfff {
				return 0, fail("ENCODING_UNSUPPORTED", "UTF-16 surrogate")
			}
			ch = utf16.DecodeRune(rune(u), rune(low))
		} else if u >= 0xdc00 && u <= 0xdfff {
			return 0, fail("ENCODING_UNSUPPORTED", "UTF-16 surrogate")
		}
		r.pending = utf8.AppendRune(r.pending, ch)
	}
	n := copy(out, r.pending)
	r.pending = r.pending[n:]
	return n, nil
}

// The formats deliberately differ in case sensitivity and note delimiters.
// Decode entities only after tokenizing, so escaped angle brackets stay text.
func plainTags(input, kind string) (string, error) {
	var out strings.Builder
	excluded := ""
	excludedOpen := ""
	excludedDepth := 0
	for len(input) > 0 {
		at := strings.IndexByte(input, '<')
		if at < 0 {
			if excluded == "" {
				out.WriteString(html.UnescapeString(input))
			}
			break
		}
		if excluded == "" {
			out.WriteString(html.UnescapeString(input[:at]))
		}
		input = input[at+1:]
		end := -1
		var quote byte
		for i := 0; i < len(input); i++ {
			c := input[i]
			if quote != 0 {
				if c == quote {
					quote = 0
				}
			} else if c == '\'' || c == '"' {
				quote = c
			} else if c == '>' {
				end = i
				break
			}
		}
		if end < 0 {
			return "", fail("INVALID_CONTENT", "unclosed text tag")
		}
		tag := strings.TrimSpace(input[:end])
		input = input[end+1:]
		fields := strings.Fields(tag)
		if len(fields) == 0 {
			return "", fail("INVALID_CONTENT", "empty tag")
		}
		name := strings.TrimSuffix(fields[0], "/")
		if excluded != "" {
			if name == excludedOpen {
				excludedDepth++
			}
			if name == excluded {
				excludedDepth--
				if excludedDepth == 0 {
					excluded = ""
				}
			}
			continue
		}
		if kind == "mybible" {
			switch name {
			case "S", "m", "n", "f", "h":
				excluded = "/" + name
				excludedOpen = name
				excludedDepth = 1
				continue
			case "i", "/i", "J", "/J", "e", "/e", "t", "/t":
				if name == "t" || name == "/t" {
					out.WriteByte('\n')
				}
				continue
			case "br", "pb":
				out.WriteByte('\n')
				continue
			}
		} else {
			if name == "RF" || name == "NB" {
				excluded = string(name[0]) + strings.ToLower(name[1:])
				excludedOpen = name
				excludedDepth = 1
				continue
			}
			if name == "TS" || name == "TS1" || name == "TS2" || name == "TS3" {
				excluded = "Ts"
				excludedOpen = name
				excludedDepth = 1
				continue
			}
			if strings.HasPrefix(name, "WG") || strings.HasPrefix(name, "WH") || strings.HasPrefix(name, "WT") || name == "RX" || strings.HasPrefix(name, "RX") || strings.HasPrefix(name, "PI") || strings.HasPrefix(name, "PF") {
				continue
			}
			switch name {
			case "FI", "Fi", "FO", "Fo", "FR", "Fr", "FU", "Fu":
				continue
			case "CL", "CM", "CI":
				out.WriteByte('\n')
				continue
			}
		}
		switch strings.ToLower(name) {
		case "b", "/b", "i", "/i", "u", "/u", "em", "/em", "strong", "/strong", "span", "/span", "font", "/font", "sup", "/sup", "sub", "/sub", "s", "/s", "rtl", "/rtl", "ltr", "/ltr":
			continue
		case "br", "p", "/p":
			out.WriteByte('\n')
			continue
		}
		return "", fail("FORMAT_UNSUPPORTED", "text tag <"+name+">")
	}
	if excluded != "" {
		return "", fail("INVALID_CONTENT", "unclosed excluded note")
	}
	if out.Len() > 64<<10 {
		return "", fail("IMPORT_LIMIT", "verse text")
	}
	return strings.TrimSpace(out.String()), nil
}
