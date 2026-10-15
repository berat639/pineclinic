import unittest

import numpy as np

from arch import extract_dental_arch
from fast_arch import extract_fast_arch


class ExtractDentalArchTest(unittest.TestCase):
    def test_extracts_u_shaped_lower_teeth_curve(self):
        volume = np.zeros((48, 256, 256), dtype=np.uint8)
        for x in range(38, 219):
            u = (x - 128) / 90
            y = int(70 + 75 * u * u)
            volume[18:30, max(0, y - 4) : min(256, y + 5), max(0, x - 2) : min(256, x + 3)] = 4
        arch = extract_dental_arch(volume, preferred_slice=23)
        self.assertEqual(arch.jaw, "lower")
        self.assertEqual(len(arch.points), 13)
        self.assertLess(arch.points[6]["y"], arch.points[0]["y"])
        self.assertGreater(arch.confidence, 0.75)

    def test_fast_arch_uses_requested_slab_not_bright_remote_structure(self):
        volume = np.zeros((80, 160, 160), dtype=np.float32)
        for x in range(28, 133):
            u = (x - 80) / 52
            y = int(42 + 42 * u * u)
            volume[34:47, max(0, y - 2):min(160, y + 3), max(0, x - 1):min(160, x + 2)] = 1200
        volume[68:79, 128:142, 12:148] = 5000
        arch = extract_fast_arch(volume, preferred_slice=40)
        self.assertEqual(arch.axial_slice, 40)
        self.assertLess(arch.points[6]["y"], arch.points[0]["y"])
        self.assertLess(arch.points[6]["y"], arch.points[-1]["y"])

    def test_model_arch_regularizes_separate_tooth_islands(self):
        volume = np.zeros((60, 180, 180), dtype=np.uint8)
        for x in range(30, 151, 12):
            u = (x - 90) / 60
            y = int(48 + 54 * u * u)
            volume[26:34, y - 3:y + 4, x - 3:x + 4] = 4
        # A remote island must not create a jagged step in the returned line.
        volume[26:34, 145:151, 92:98] = 4
        arch = extract_dental_arch(volume, preferred_slice=30)
        values = np.asarray([point["y"] for point in arch.points])
        self.assertLess(arch.points[6]["y"], arch.points[0]["y"])
        self.assertLess(arch.points[6]["y"], arch.points[-1]["y"])
        self.assertLess(float(np.max(np.abs(np.diff(values, n=2)))), 18)


if __name__ == "__main__":
    unittest.main()
