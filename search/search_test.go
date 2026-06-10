package search

import "testing"

func TestMatcherTerms(t *testing.T) {
	m := NewMatcher("report")
	if !m.Match("/docs/Annual Report.pdf", "Annual Report.pdf") {
		t.Error("should match a substring of the name, case-insensitively")
	}
	if m.Match("/docs/budget.xlsx", "budget.xlsx") {
		t.Error("should not match an unrelated name")
	}
}

func TestMatcherCaseSensitive(t *testing.T) {
	insensitive := NewMatcher("readme")
	if !insensitive.Match("/README.md", "README.md") {
		t.Error("case-insensitive (default) should match README")
	}
	sensitive := NewMatcher("readme case:sensitive")
	if sensitive.Match("/README.md", "README.md") {
		t.Error("case:sensitive should NOT match README for term 'readme'")
	}
	if !sensitive.Match("/readme.md", "readme.md") {
		t.Error("case:sensitive should match the exact-case term")
	}
}

func TestMatcherExtensionCondition(t *testing.T) {
	m := NewMatcher("type:pdf")
	if !m.Match("/a/b.pdf", "b.pdf") {
		t.Error("type:pdf should match a .pdf")
	}
	if m.Match("/a/b.txt", "b.txt") {
		t.Error("type:pdf should not match a .txt")
	}
}

func TestMatcherConditionPlusTerm(t *testing.T) {
	// A condition AND a term: extension must match AND the name must contain it.
	m := NewMatcher("type:pdf invoice")
	if !m.Match("/x/invoice-2026.pdf", "invoice-2026.pdf") {
		t.Error("pdf named with 'invoice' should match")
	}
	if m.Match("/x/invoice-2026.txt", "invoice-2026.txt") {
		t.Error("a .txt named 'invoice' fails the type:pdf condition")
	}
	if m.Match("/x/report.pdf", "report.pdf") {
		t.Error("a .pdf without the term 'invoice' should not match")
	}
}

func TestMatcherEmptyMatchesAll(t *testing.T) {
	m := NewMatcher("")
	if !m.Match("/anything.bin", "anything.bin") {
		t.Error("an empty query should match everything")
	}
}
