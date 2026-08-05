/**
 * Saggio legale di interesse (art. 1284 c.c.).
 * Tassi espressi in basis point (1% = 100 bp) per aritmetica decimal-safe.
 * Fonte: decreti MEF pubblicati in Gazzetta Ufficiale.
 */
export const LEGAL_INTEREST_RATES_BP: Readonly<Record<number, number>> = {
  1997: 500,
  1998: 500,
  1999: 250,
  2000: 250,
  2001: 350,
  2002: 300,
  2003: 300,
  2004: 250,
  2005: 250,
  2006: 250,
  2007: 250,
  2008: 300,
  2009: 300,
  2010: 100,
  2011: 150,
  2012: 250,
  2013: 250,
  2014: 100,
  2015: 50,
  2016: 20,
  2017: 10,
  2018: 30,
  2019: 80,
  2020: 5,
  2021: 1,
  2022: 125,
  2023: 500,
  2024: 250,
  2025: 200,
};