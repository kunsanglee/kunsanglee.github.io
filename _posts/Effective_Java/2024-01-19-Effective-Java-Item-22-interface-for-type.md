---
title: "Effective Java - 아이템 22: 인터페이스는 타입을 정의하는 용도로만 사용하라"
categories:
  - Effective Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

### 인터페이스의
인터페이스는 **자신을 구현한 클래스의 인스턴스를 참조할 수 있는 타입 역할**을 한다.
달리 말해, 클래스가 어떤 인터페이스를 구현한다는 것은 **자신의 인스턴스로 무엇을 할 수 있는지를 클라이언트에 얘기해주는 것**이다.
인터페이스는 오직 이 용도로만 사용해야 한다.

### 안티패턴 인터페이스 사용
이 지침에 반하는 예로 상수 인터페이스라는 것이 있다.
상수 인터페이스란 메서드 없이, 상수를 뜻하는 static final 필드로만 가득 찬 인터페이스를 말한다.

```java
// 상수 인터페이스 안티패턴
public interface PhysicalConstants {
    // 아보가드로 수 (1/몰)
    static final double AVOGADROS_NUMBER = 6.022_149_857e3;
    
    // 볼츠만 상수 (J/K)
    static final double BOLTZMANN_CONSTANT = 1.380_648_52e-23;
    
    // 전자 질량 (kg)
    static final double ELECTRON_MASS = 9.109_383_56e-31;
}
```

상수 인터페이스 안티패턴은 인터페이스를 잘못 사용한 예다.
**클래스 내부에서 사용하는 상수는 외부 인터페이스가 아니라 내부 구현에 해당**한다.
따라서 상수 인터페이스를 구현하는 것은 이 **내부 구현을 클래스 API로 노출하는 행위**다.
사용자에게 아무런 의미도 없이 혼동을 주며 클라이언트 코드가 내부 구현에 해당하는 이 상수들에 종속되게 한다.

### 상수 공개를 위한 선택지
상수를 공개할 목적이라면 더 합당한 선택지가 몇 가지 있다.
특정 클래스나 인터페이스와 강하게 연관된 상수라면 그 **클래스나 인터페이스 자체에 추가**해야 한다. 
모든 숫자 기본 타입의 박싱 클래스가 대표적으로, Integer와 Double에 선언된 MIN_VALUE, MAX_VALUE 상수가 이런 예다.
**열거 타입**으로 나타내기 적합한 상수라면 열거 타입으로 만들어 공개하면 된다. 
그것도 아니라면 **인스턴스화할 수 없는 유틸리티 클래스**에 담아 공개하자.

```java
// 상수 유틸리티 클래스
public class PhysicalConstants {
    private PhysicalConstants() { } // 인스턴스화 방지

    // 아보가드로 수 (1/몰)
    public static final double AVOGADROS_NUMBER = 6.022_149_857e3;

    // 볼츠만 상수 (J/K)
    public static final double BOLTZMANN_CONSTANT = 1.380_648_52e-23;

    // 전자 질량 (kg)
    public static final double ELECTRON_MASS = 9.109_383_56e-31;
}

// 사용하는 쪽에서 클래스이름.변수명을 명시하여 사용
double electronMass = PhysicalConstants.ELECTRON_MASS;

// 정적 임포트를 한다면 클래스명을 생략할 수 있다.
double boltzmannConstant = BOLZMANN_CONSTANT;
```

유틸리티 클래스에 정의된 상수를 클라이언트에서 사용하려면 클래스 이름까지 함께 명시해야 한다.

### 핵심 정리
**인터페이스는 타입을 정의하는 용도**로만 사용해야 한다.<br>
상수 공개용 수단으로 사용하지 말자.
