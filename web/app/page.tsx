import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { ZKExplainer } from "@/components/ZKExplainer";
import { Architecture } from "@/components/Architecture";
import { LiveDemo } from "@/components/LiveDemo";
import { Benchmarks } from "@/components/Benchmarks";
import { ChainContext } from "@/components/ChainContext";
import { Methodology } from "@/components/Methodology";
import { CloneCTA } from "@/components/CloneCTA";
import { Footer } from "@/components/Footer";

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <ZKExplainer />
        <Architecture />
        <LiveDemo />
        <Benchmarks />
        <ChainContext />
        <Methodology />
        <CloneCTA />
      </main>
      <Footer />
    </>
  );
}
