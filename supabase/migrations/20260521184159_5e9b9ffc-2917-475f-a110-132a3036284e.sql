CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  email text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers readable by everyone" ON public.suppliers FOR SELECT USING (true);
CREATE POLICY "suppliers writable by anyone" ON public.suppliers FOR INSERT WITH CHECK (true);
CREATE POLICY "suppliers updatable by anyone" ON public.suppliers FOR UPDATE USING (true) WITH CHECK (true);

CREATE TRIGGER suppliers_set_updated_at BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO public.suppliers (name, email, phone) VALUES
('3M','nicholas.r.kessler@gmail.com','+41 32 188 74 42'),
('Ansell','nicholas.r.kessler@gmail.com','+41 55 280 88 46'),
('Bauhaus','nicholas.r.kessler@gmail.com','+41 52 223 51 80'),
('Beton','nicholas.r.kessler@gmail.com','+41 56 305 11 45'),
('BGS','nicholas.r.kessler@gmail.com','+41 62 227 97 38'),
('Bosch','nicholas.r.kessler@gmail.com','+41 62 236 81 46'),
('Brennenstuhl','nicholas.r.kessler@gmail.com','+41 31 162 90 18'),
('Caparol','nicholas.r.kessler@gmail.com','+41 22 274 48 76'),
('Caramba','nicholas.r.kessler@gmail.com','+41 71 304 55 51'),
('Collomix','nicholas.r.kessler@gmail.com','+41 61 153 72 87'),
('CREA','nicholas.r.kessler@gmail.com','+41 56 133 96 12'),
('Deiss','nicholas.r.kessler@gmail.com','+41 33 149 64 24'),
('Dräger','nicholas.r.kessler@gmail.com','+41 22 331 60 28'),
('Edding','nicholas.r.kessler@gmail.com','+41 32 245 48 22'),
('Fischer','nicholas.r.kessler@gmail.com','+41 34 125 24 64'),
('Generisch','nicholas.r.kessler@gmail.com','+41 51 234 39 99'),
('HellermannTyton','nicholas.r.kessler@gmail.com','+41 91 197 85 12'),
('HGC','nicholas.r.kessler@gmail.com','+41 52 100 33 49'),
('Illbruck','nicholas.r.kessler@gmail.com','+41 51 177 73 70'),
('Jung','nicholas.r.kessler@gmail.com','+41 21 244 54 45'),
('Klingspor','nicholas.r.kessler@gmail.com','+41 22 118 79 46'),
('KRUM','nicholas.r.kessler@gmail.com','+41 44 290 74 49'),
('Lapp','nicholas.r.kessler@gmail.com','+41 33 187 91 68'),
('MAXIMUM','nicholas.r.kessler@gmail.com','+41 62 195 33 82'),
('Obi','nicholas.r.kessler@gmail.com','+41 55 133 93 69'),
('Reisser','nicholas.r.kessler@gmail.com','+41 44 147 95 80'),
('RIKO/CREA','nicholas.r.kessler@gmail.com','+41 27 314 19 24'),
('Soppec','nicholas.r.kessler@gmail.com','+41 34 319 59 20'),
('Soudal','nicholas.r.kessler@gmail.com','+41 61 296 34 86'),
('Stabila','nicholas.r.kessler@gmail.com','+41 55 151 80 24'),
('Stanley','nicholas.r.kessler@gmail.com','+41 44 176 44 31'),
('Storch','nicholas.r.kessler@gmail.com','+41 22 138 27 49'),
('Swisscom/PEHD','nicholas.r.kessler@gmail.com','+41 55 343 71 51'),
('Tesa','nicholas.r.kessler@gmail.com','+41 33 147 84 94'),
('Toom','nicholas.r.kessler@gmail.com','+41 27 302 77 84'),
('Tork','nicholas.r.kessler@gmail.com','+41 43 204 82 38'),
('Uvex','nicholas.r.kessler@gmail.com','+41 34 294 30 55'),
('Vileda','nicholas.r.kessler@gmail.com','+41 27 202 29 86'),
('WD-40','nicholas.r.kessler@gmail.com','+41 91 315 18 83'),
('Weicon','nicholas.r.kessler@gmail.com','+41 24 323 67 43'),
('Wolfcraft','nicholas.r.kessler@gmail.com','+41 55 287 92 67'),
('Würth','nicholas.r.kessler@gmail.com','+41 24 192 62 17');