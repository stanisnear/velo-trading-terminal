import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('configure_services', Path(__file__).with_name('configure_services.py'))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)

class ConfigurationTests(unittest.TestCase):
    def values(self):
        return {'SUPABASE_URL': setup.SB_URL, 'SUPABASE_ANON_KEY': 'public-fixture',
                'SUPABASE_SERVICE_ROLE_KEY': 'private-fixture', 'PRIVATE_KEY': 'a'*64,
                'VELO_SPONSOR_PRIVATE_KEY': 'b'*64, 'CRON_SECRET': 'fixture-secret-123456',
                'VITE_VELO_PERPS_V3_ADDRESS': '0x'+'1'*40, 'GA_PRIVATE_KEY': 'line1\nline2'}

    def test_secrets_stay_out_of_frontend_and_exact_multiline_values_survive(self):
        original = self.values()
        backend, frontend = setup.map_values(original, 'gateway-fixture')
        self.assertEqual(backend['VELO_IMPORTED_SUPABASE_SERVICE_ROLE_KEY'], original['SUPABASE_SERVICE_ROLE_KEY'])
        self.assertEqual(backend['GA_PRIVATE_KEY'], 'line1\nline2')
        self.assertEqual(backend['VELO_KEEPERS_ENABLED'], 'false')
        self.assertEqual(backend['VELO_SPONSOR_ENABLED'], 'false')
        self.assertNotIn('PRIVATE_KEY', frontend)
        self.assertNotIn('SUPABASE_SERVICE_ROLE_KEY', frontend)
        self.assertEqual(frontend['VELO_PROXY_TOKEN']['type'], 'secret_text')
        self.assertEqual(frontend['VITE_SUPABASE_ANON_KEY']['value'], 'public-fixture')

    def test_mismatched_database_and_secret_public_prefix_are_rejected(self):
        values = self.values(); values['SUPABASE_URL'] = 'https://other.supabase.co'
        with self.assertRaises(RuntimeError): setup.validate(values, list(values))
        values = self.values(); values['VITE_PRIVATE_KEY'] = 'bad'
        with self.assertRaises(RuntimeError): setup.validate(values, list(values))

    def test_unexpected_host_is_rejected_before_network(self):
        with self.assertRaises(RuntimeError): setup.api('https://example.com/secrets', 'fixture')

if __name__ == '__main__': unittest.main()
