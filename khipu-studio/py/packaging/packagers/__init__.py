#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Platform-specific audiobook packagers for Khipu Studio.

Each packager reads the universal manifest and generates
platform-specific package formats.
"""

from .m4b_packager import package_m4b

__all__ = ['package_m4b']
