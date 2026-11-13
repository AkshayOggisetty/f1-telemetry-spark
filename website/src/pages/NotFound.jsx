import { Link } from 'react-router-dom'
import { Page } from '../components/ui'

export default function NotFound() {
  return (
    <Page>
      <div className="notfound">
        <div className="kicker">Red flag</div>
        <h1>404</h1>
        <p className="muted">This page has gone off track. Head back to the pits.</p>
        <Link to="/" className="btn primary" style={{ marginTop: 16 }}>
          Back to home
        </Link>
      </div>
    </Page>
  )
}
