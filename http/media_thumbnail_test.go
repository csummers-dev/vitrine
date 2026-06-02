package fbhttp

import "testing"

func mkPkg() *epubPackage {
	return &epubPackage{}
}

func TestFindEpubCoverHref(t *testing.T) {
	t.Run("epub3 cover-image property wins", func(t *testing.T) {
		p := mkPkg()
		p.Manifest.Items = []struct {
			ID         string `xml:"id,attr"`
			Href       string `xml:"href,attr"`
			MediaType  string `xml:"media-type,attr"`
			Properties string `xml:"properties,attr"`
		}{
			{ID: "x", Href: "images/cover.jpg", MediaType: "image/jpeg", Properties: "cover-image"},
			{ID: "y", Href: "images/other.jpg", MediaType: "image/jpeg"},
		}
		if got := findEpubCoverHref(p); got != "images/cover.jpg" {
			t.Fatalf("got %q, want images/cover.jpg", got)
		}
	})

	t.Run("epub2 meta cover → manifest id", func(t *testing.T) {
		p := mkPkg()
		p.Metadata.Metas = []struct {
			Name    string `xml:"name,attr"`
			Content string `xml:"content,attr"`
		}{
			{Name: "cover", Content: "cover-img"},
		}
		p.Manifest.Items = []struct {
			ID         string `xml:"id,attr"`
			Href       string `xml:"href,attr"`
			MediaType  string `xml:"media-type,attr"`
			Properties string `xml:"properties,attr"`
		}{
			{ID: "cover-img", Href: "cover.jpeg", MediaType: "image/jpeg"},
			{ID: "ch1", Href: "ch1.xhtml", MediaType: "application/xhtml+xml"},
		}
		if got := findEpubCoverHref(p); got != "cover.jpeg" {
			t.Fatalf("got %q, want cover.jpeg", got)
		}
	})

	t.Run("name-hint fallback (image item named cover)", func(t *testing.T) {
		p := mkPkg()
		p.Manifest.Items = []struct {
			ID         string `xml:"id,attr"`
			Href       string `xml:"href,attr"`
			MediaType  string `xml:"media-type,attr"`
			Properties string `xml:"properties,attr"`
		}{
			{ID: "img1", Href: "Images/Cover.png", MediaType: "image/png"},
			{ID: "ch1", Href: "ch1.xhtml", MediaType: "application/xhtml+xml"},
		}
		if got := findEpubCoverHref(p); got != "Images/Cover.png" {
			t.Fatalf("got %q, want Images/Cover.png", got)
		}
	})

	t.Run("fallback ignores non-image cover-named items", func(t *testing.T) {
		p := mkPkg()
		p.Manifest.Items = []struct {
			ID         string `xml:"id,attr"`
			Href       string `xml:"href,attr"`
			MediaType  string `xml:"media-type,attr"`
			Properties string `xml:"properties,attr"`
		}{
			{ID: "cover", Href: "cover.xhtml", MediaType: "application/xhtml+xml"},
		}
		if got := findEpubCoverHref(p); got != "" {
			t.Fatalf("got %q, want empty (cover page is not an image)", got)
		}
	})

	t.Run("no cover", func(t *testing.T) {
		p := mkPkg()
		p.Manifest.Items = []struct {
			ID         string `xml:"id,attr"`
			Href       string `xml:"href,attr"`
			MediaType  string `xml:"media-type,attr"`
			Properties string `xml:"properties,attr"`
		}{
			{ID: "ch1", Href: "ch1.xhtml", MediaType: "application/xhtml+xml"},
		}
		if got := findEpubCoverHref(p); got != "" {
			t.Fatalf("got %q, want empty", got)
		}
	})
}
