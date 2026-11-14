# Captured identity coverage cases

Public WTS native film articles and selected Cinemeta movie metadata fields captured on 14 November 2026. Only film-subject fields used by the parser and identity proof are retained; metadata IDs and source identity are unchanged.

- `koln-75-2025`: WTS https://whentostream.com/koln-75-2025/ and Cinemeta https://v3-cinemeta.strem.io/meta/movie/tt20414360.json. Search summary says **Cologne 75**, but exact-ID movie metadata says **Köln 75** and supplies matching director/cast. The summary is discovery, never alias proof.
- `strange-harvest-2024`: WTS https://whentostream.com/strange-harvest-2024/ and Cinemeta https://v3-cinemeta.strem.io/meta/movie/tt33400719.json. Source year 2024 and metadata year 2025 differ; only one cast spelling matches. Exact director, complete shared synopsis, runtime and theatrical date supply independent corroboration. The fixture tests that removing any required evidence or changing the movie subject rejects it.

Dates and source content may change after capture. These snapshots are regression evidence, not a live release-date authority.
