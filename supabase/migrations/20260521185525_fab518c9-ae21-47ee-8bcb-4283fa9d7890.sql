
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';

-- Default everyone to German (most are Swiss/German market suppliers)
UPDATE public.suppliers SET language = 'de';

-- French-speaking suppliers
UPDATE public.suppliers SET language = 'fr'
WHERE name IN ('Soppec', 'CREA', 'RIKO/CREA');

-- English-speaking international suppliers
UPDATE public.suppliers SET language = 'en'
WHERE name IN ('Ansell', 'Stanley', 'WD-40', 'Soudal', 'Tork', 'Vileda', '3M');
