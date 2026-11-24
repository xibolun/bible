package importer

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"

	"github.com/xibolun/bible/internal/bible"
	_ "modernc.org/sqlite"
)

// MyBible's PalmBible numbering has gaps; it is NOT a 1-based canon index.
var myBibleNumbers = []int{10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 190, 220, 230, 240, 250, 260, 290, 300, 310, 330, 340, 350, 360, 370, 380, 390, 400, 410, 420, 430, 440, 450, 460, 470, 480, 490, 500, 510, 520, 530, 540, 550, 560, 570, 580, 590, 600, 610, 620, 630, 640, 650, 660, 670, 680, 690, 700, 710, 720, 730}

func parseSQLite(ctx context.Context, filename string, d *Draft, canon *bible.Dataset) error {
	db, err := sql.Open("sqlite", (&url.URL{Scheme: "file", Path: filename}).String()+"?mode=ro&immutable=1")
	if err != nil {
		return err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err = db.ExecContext(ctx, "PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;"); err != nil {
		return fail("INVALID_CONTENT", "SQLite header")
	}
	rows, err := db.QueryContext(ctx, "SELECT name,type,sql FROM sqlite_schema")
	if err != nil {
		return fail("INVALID_CONTENT", "SQLite schema")
	}
	tables := map[string]bool{}
	for rows.Next() {
		var name, kind string
		var declaration sql.NullString
		if rows.Scan(&name, &kind, &declaration) != nil {
			rows.Close()
			return fail("INVALID_CONTENT", "schema record")
		}
		if kind == "view" || kind == "trigger" || strings.Contains(strings.ToUpper(declaration.String), "CREATE VIRTUAL TABLE") {
			rows.Close()
			return fail("SCHEMA_UNSUPPORTED", "views, triggers and virtual tables")
		}
		if kind == "table" {
			tables[strings.ToLower(name)] = true
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	// Generated columns can evaluate schema-supplied expressions even on SELECT.
	// Only physical columns of the fixed supported tables may be read.
	for _, name := range []string{"info", "books", "books_all", "verses", "details", "bible"} {
		if !tables[name] {
			continue
		}
		columns, e := db.QueryContext(ctx, "PRAGMA table_xinfo("+name+")")
		if e != nil {
			return fail("SCHEMA_UNSUPPORTED", "table columns")
		}
		for columns.Next() {
			var cid, notnull, pk, hidden int
			var col, typ string
			var defaultValue sql.NullString
			if e = columns.Scan(&cid, &col, &typ, &notnull, &defaultValue, &pk, &hidden); e != nil {
				columns.Close()
				return fail("SCHEMA_UNSUPPORTED", "table columns")
			}
			if hidden != 0 {
				columns.Close()
				return fail("SCHEMA_UNSUPPORTED", "generated or hidden column")
			}
		}
		e = columns.Err()
		columns.Close()
		if e != nil {
			return e
		}
	}
	query := ""
	numberToBook := map[int]string{}
	present := map[int]bool{}
	if tables["verses"] && tables["info"] && tables["bible"] && tables["details"] {
		return fail("FORMAT_AMBIGUOUS", "two Bible schemas")
	}
	if tables["verses"] && tables["info"] && (tables["books"] || tables["books_all"]) {
		d.Format = "mybible"
		d.Profile = "MyBible info/books/verses 2026-11"
		query = "SELECT book_number,chapter,CAST(verse AS TEXT),text FROM verses ORDER BY book_number,chapter,verse"
		for i, n := range myBibleNumbers {
			numberToBook[n] = canon.Books[i].ID
		}
		bookQuery := "SELECT book_number FROM books"
		if tables["books_all"] {
			bookQuery = "SELECT book_number FROM books_all WHERE is_present=1"
		}
		bookRows, e := db.QueryContext(ctx, bookQuery)
		if e != nil {
			return fail("SCHEMA_UNSUPPORTED", "MyBible book columns")
		}
		for bookRows.Next() {
			var number int
			if e = bookRows.Scan(&number); e != nil {
				bookRows.Close()
				return fail("INVALID_CONTENT", "MyBible book record")
			}
			if numberToBook[number] == "" {
				bookRows.Close()
				return fail("REFERENCE_UNSUPPORTED", fmt.Sprintf("book %d", number))
			}
			present[number] = true
		}
		e = bookRows.Err()
		bookRows.Close()
		if e != nil {
			return e
		}
		meta, e := db.QueryContext(ctx, "SELECT name,value FROM info")
		if e != nil {
			return fail("SCHEMA_UNSUPPORTED", "MyBible info")
		}
		for meta.Next() {
			var k, v string
			if meta.Scan(&k, &v) != nil {
				meta.Close()
				return fail("INVALID_CONTENT", "info record")
			}
			if len(v) > 64<<10 || len(d.Metadata) > 128 {
				meta.Close()
				return fail("IMPORT_LIMIT", "metadata")
			}
			d.Metadata[k] = v
		}
		err = meta.Err()
		meta.Close()
		if err != nil {
			return err
		}
		d.Name = d.Metadata["description"]
		d.Abbreviation = d.Metadata["abbreviation"]
		d.Language = d.Metadata["language"]
		d.SourceEdition = d.Metadata["version_date"]
		d.SourceURL = d.Metadata["origin"]
		d.License = d.Metadata["detailed_info"]
		if d.License == "" {
			d.License = d.Metadata["copyright"]
		}
		if d.License == "" {
			d.License = d.Metadata["license"]
		}
		if d.License == "" {
			d.License = d.Metadata["origin"]
		}
	} else if tables["bible"] && tables["details"] {
		d.Format = "mysword"
		d.Profile = "MySword Details/Bible 2015-04 text subset"
		query = "SELECT Book,Chapter,CAST(Verse AS TEXT),Scripture FROM Bible ORDER BY Book,Chapter,Verse"
		for i, b := range canon.Books {
			numberToBook[i+1] = b.ID
		}
		meta, e := db.QueryContext(ctx, "SELECT * FROM Details LIMIT 2")
		if e != nil {
			return fail("SCHEMA_UNSUPPORTED", "MySword Details")
		}
		cols, e := meta.Columns()
		if e != nil {
			meta.Close()
			return e
		}
		if len(cols) > 128 {
			meta.Close()
			return fail("IMPORT_LIMIT", "Details columns")
		}
		count := 0
		for meta.Next() {
			count++
			if count > 1 {
				meta.Close()
				return fail("SCHEMA_UNSUPPORTED", "multiple Details records")
			}
			values := make([]sql.NullString, len(cols))
			args := make([]any, len(cols))
			for i := range values {
				args[i] = &values[i]
			}
			if meta.Scan(args...) != nil {
				meta.Close()
				return fail("INVALID_CONTENT", "Details record")
			}
			for i, c := range cols {
				if len(values[i].String) > 64<<10 {
					meta.Close()
					return fail("IMPORT_LIMIT", "metadata")
				}
				d.Metadata[strings.ToLower(c)] = values[i].String
			}
		}
		err = meta.Err()
		meta.Close()
		if err != nil {
			return err
		}
		if count != 1 {
			return fail("SCHEMA_UNSUPPORTED", "MySword Details row count")
		}
		if !supportedMySwordRules(d.Metadata["verserules"]) {
			return fail("FORMAT_UNSUPPORTED", "MySword custom VerseRules")
		}
		if d.Metadata["verserules"] != "" {
			note(d, "已识别font/HEB样式包装；保留正文，不执行文件中的正则表达式 / Recognized font/HEB wrappers; text retained without executing source regular expressions")
		}
		d.Name = d.Metadata["description"]
		if d.Name == "" {
			d.Name = d.Metadata["title"]
		}
		d.Abbreviation = d.Metadata["abbreviation"]
		d.Language = d.Metadata["language"]
		d.SourceEdition = d.Metadata["versiondate"]
		d.SourceURL = d.Metadata["source"]
		d.License = d.Metadata["comments"]
	} else {
		return fail("SCHEMA_UNSUPPORTED", "not a supported Bible database")
	}
	verses, e := db.QueryContext(ctx, query)
	if e != nil {
		return fail("SCHEMA_UNSUPPORTED", d.Format+" verse columns")
	}
	defer verses.Close()
	total := 0
	for verses.Next() {
		if err = ctx.Err(); err != nil {
			return err
		}
		var number, ch int
		var label, text string
		if verses.Scan(&number, &ch, &label, &text) != nil {
			return fail("INVALID_CONTENT", "verse record")
		}
		book := numberToBook[number]
		if d.Format == "mybible" && !present[number] {
			return fail("REFERENCE_UNSUPPORTED", fmt.Sprintf("orphan book %d", number))
		}
		if book == "" {
			return fail("REFERENCE_UNSUPPORTED", fmt.Sprintf("book %d", number))
		}
		if len(text) > 1<<20 {
			return fail("IMPORT_LIMIT", "source verse")
		}
		kind := "mysword"
		if d.Format == "mybible" {
			kind = "mybible"
		}
		plain, e := plainTags(text, kind)
		if e != nil {
			return e
		}
		total += len(plain)
		if len(d.Records) >= 100000 || total > MaxText {
			return fail("IMPORT_LIMIT", "text size")
		}
		d.Records = append(d.Records, Record{book, ch, label, plain})
	}
	if e = verses.Err(); e != nil {
		return e
	}
	return nil
}

// These exact ASV 2.3.7 rules only unwrap styling. The tokenizer implements
// their text-preserving behavior; arbitrary replacement rules are not executed.
func supportedMySwordRules(rules string) bool {
	rules = strings.NewReplacer(`\r\n`, "\n", `\n`, "\n", `\t`, "\t", "\r\n", "\n").Replace(rules)
	for _, line := range strings.Split(rules, "\n") {
		switch strings.TrimSpace(line) {
		case "", "<font color=(.*?)>(.*?)</font>\t$2", "<HEB>(.*?)<heb>\t$1":
		default:
			return false
		}
	}
	return true
}
