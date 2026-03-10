import type { SVGAttributes } from 'react'

const LogoVector = (props: SVGAttributes<SVGElement>) => {
  return (
    <svg width='1em' height='1em' viewBox='0 0 128 128' fill='none' xmlns='http://www.w3.org/2000/svg' {...props}>
      <path
        d='M63.6734 24.8486V49.3899C63.6734 57.4589 57.1322 64.0001 49.0632 64.0001H25.2041'
        stroke='currentColor'
        strokeWidth='8.11681'
      />
      <path
        d='M64.3266 103.152L64.3266 78.6106C64.3266 70.5416 70.8678 64.0003 78.9368 64.0003L102.796 64.0004'
        stroke='currentColor'
        strokeWidth='8.11681'
      />
      <line x1='93.3468' y1='35.6108' x2='76.555' y2='52.205' stroke='currentColor' strokeWidth='8.11681' />
      <line x1='51.7697' y1='77.0624' x2='34.9778' y2='93.6567' stroke='currentColor' strokeWidth='8.11681' />
      <line x1='50.9584' y1='51.3189' x2='34.2651' y2='34.6256' stroke='currentColor' strokeWidth='8.11681' />
      <line x1='93.1625' y1='93.6397' x2='76.4692' y2='76.9464' stroke='currentColor' strokeWidth='8.11681' />
    </svg>
  )
}

export default LogoVector
