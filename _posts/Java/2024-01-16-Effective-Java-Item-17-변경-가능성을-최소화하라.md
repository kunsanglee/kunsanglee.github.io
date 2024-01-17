---
title: "Effective Java - 아이템 17: 변경 가능성을 최소화하라"
categories:
  - Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

### 불변 클래스

불변 클래스랄 간단히 말해 그 인스턴스의 내부 값을 수정할 수 없는 클래스다. <br>
불변 인스턴스에 간직된 정보는 고정되어 객체가 파괴되는 순간까지 절대 달라지지 않는다. <br>
불변 클래스는 가변 클래스보다 설계하고 구현하고 사용하기 쉬우며, 오류가 생길 여지도 적고 훨씬 안전하다.<br>

### 불변 클래스를 만들기 위한 5가지 규칙

1. **객체의 상태를 변경하는 메서드(변경자)를 제공하지 않는다.**
2. **클래스를 확장할 수 없도록 한다.**
- 하위 클래스에서 부주의하게 혹은 나쁜 의도로 객체의 상태를 변하게 만드는 사태를 막아준다.

3. **모든 필드를 final로 선언한다.**
- 시스템이 강제하는 수단을 이용해 설계자의 의도를 명확히 드러내는 방법이다. 새로 생성된 인스턴스를 동기화 없이 다른 스레드로 건네도 문제없이 동작하게끔 보장하는 데도 필요하다.

4. **모든 필드를 private로 선언한다.**
- 필드가 참조하는 가변 객체를 클라이언트에서 직접 접근해 수정하는 일을 막아준다. 기술적으로는 기본 타입 필드나 불변 객체를 참조하는 필드를 public final로만 선언해도 불변 객체가 되지만, 이렇게 하면
  다음 릴리스에서 내부 표현을 바꾸지 못하므로 권하지 않는다.

5. **자신 외에는 내부의 가변 컴포넌트에 접근할 수 없도록 한다.**
- 클래스에 가변 객체를 참조하는 필드가 하나라도 있다면 클라이언트에서 그 객체의 참조를 얻을 수 없도록 해야 한다. 이런 필드는 절대 클라이언트가 제공한 객체 참조를 가리키게 해서는 안 되며, 접근자 메서드가 그
  필드를 그대로 반환해서도 안 된다. 생성자, 접근자, readObject 메서드 모두에서 방어적 복사를 수행하라.

```java
public final class Complex {
    private final double re;
    private final double im;

    public Complex(double re, double im) {
        this.re = re;
        this.im = im;
    }

    public double readPart() {
        return re;
    }

    public double imaginaryPart() {
        return im;
    }

    public Complex plus(Complex c) {
        return new Complex(re + c.re, im + c.im);
    }

    public Complex minus(Complex c) {
        return new Complex(re - c.re, im - c.im);
    }

    public Complex times(Complex c) {
        return new Complex(re * c.re - im * c.im, re * c.im + im * c.re);
    }

    public Complex dividedBy(Complex c) {
        double tmp = c.re * c.re + c.im * c.im;
        return new Complex(re * c.re + im * c.im) / tmp,
        im * c.re - re * c.im) /tmp)
    }

    @Override
    public boolean equals(Object o) {
        if (o == this) {
            return true;
        }
        if (!(o instanceof Complex) {
            return false;
        }
        Complex c = (Complex) o;

        // == 대신 compare를 사용하는 이유는 Double과 Float은 부동소수이기 때문
        // 또한 Float.equals, Double.equals 메서드를 사용할 수 있지만 이 메서드들은
        // 오토박싱을 수반하므로 성능상 좋지 않다
        return Double.compare(c.re, re) == 0 && Double.compare(c.im, im) == 0;
    }

    @Override
    public int hashCode() {
        return 31 * Double.hashCode(re) + Double.hashCode(im);
    }

    @Override
    public String toString() {
        return "(" + re + " + " + im + "i)";
    }
}
```

이 코드에서 사칙연산 메서드들이 인스턴스 자신은 수정하지 않고 새로운 Complex 인스턴스를 만들어낸다. 이처럼 피연산자에 함수를 적용해 그 결과를 반환하지만, 피연산자 자체는 그대로인 프로그래밍 패턴을 함수형
프로그래밍이라 한다. 또한 메서드 이름으로 (add 같은) 동사 대신 (plus 같은) 전치사를 사용한 점에 주목하자. 이는 해당 메서드가 객체의 값을 변경하지 않는다는 사실을 강조하려는 의도다.

### 불변 객체의 장점

- 불변 객체는 단순하다.

불변 객체는 생성된 시점의 상태를 파괴될 때까지 그대로 간직한다.

- 불변 객체는 근본적으로 스레드 안전하여 따로 동기화할 필요 없다.

따라서 불변 클래스라면 한 번 만든 인스턴스를 최대한 재활용하기를 권한다. 가장 쉬운 재활용 방법은 자주 쓰이는 값들을 상수(public static final)로 제공하는 것이다.

```java
public static final Complex ZERO = new Complex(0, 0);
public static final Complex ONE = new Complex(1, 0);
public static final Complex I = new Complex(0, 1);
```

불변 클래스는 자주 사용되는 인스턴스를 캐싱하여 같은 인스턴스를 중복 생성하지 않게 해주는 정적 팩터리를 제공할 수 있다.<br> 
이런 정적 팩터리를 사용하면 여러 클라이언트가 인스턴스를 공유하여 메모리 사용량과 가비지 컬렉션 비용이 줄어든다.<br> 
새로운 클래스를 설계할 때 public 생성자 대신 정적 팩터리를 만들어두면, 클라이언트를 수정하지 않고도 필요에 따라 캐시 기능을 나중에 덧붙일 수 있다.

불변 객체를 자유롭게 공유할 수 있다는 점은 방어적 복사도 필요 없다는 결론으로 자연스럽게 이어진다.<br> 
그러니 불변 클래스는 clone 메서드나 복사 생성자를 제공하지 않는 게 좋다.

- 불변 객체는 자유롭게 공유할 수 있음은 물론, 불변 객체끼리는 내부 데이터를 공유할 수 있다.
- 객체를 만들 때 다른 불변 객체들을 구성요소로 사용하면 이점이 많다.
값이 바뀌지 않는 구성요소들로 이루어진 객체라면 그 구조가 아무리 복잡하더라도 불변식을 유지하기 훨씬 수월하기 때문이다.

- 불변 객체는 그 자체로 실패 원자성을 제공한다.
실패 원자성이란 메서드에서 예외가 발생한 후에도 그 객체는 여전히 (메서드 호출 전과 똑같은) 유효한 상태여야 한다는 성질이다.

### 불변 객체의 단점

- 값이 다르면 반드시 독립된 객체로 만들어야 한다.
값의 가짓수가 많다면 이들을 모두 만드는 데 큰 비용을 치러야 한다.

### 불변 클래스를 만드는 설계 방법

클래스가 불변임을 보장하려면 상속이 불가능하게 해야 한다.<br> 
자신을 상속하지 못하게 하는 가장 쉬운 방법은 final 클래스로 선언하는 것이지만, 더 유연한 방법이 있다.<br> 
모든 생성자를 private 혹은 package-private으로 만들고 public 정적 팩터리를 제공하는 방법이다.

```java
public class Complex {
    private final double re;
    private final double im;

    private Complex(double re, double im) {
        this.re = re;
        this.im = im;
    }

    public static Complex valueOf(double re, double im) {
        return new Complex(re, im);
    }
}
```

패키지 바깥의 클라이언트에서 바라본 이 불변 객체는 사실상 final이다.<br> 
public이나 protected 생성자가 없으니 다른 패키지에서는 이 클래스를 확장하는 게 불가능하기 때문이다.<br> 
정적 팩터리 방식은 다수의 구현 클래스를 활용한 유연성을 제공하고,<br> 
이에 더해 다음 릴리스에서 객체 캐싱 기능을 추가해 성능을 끌어올릴 수도 있다.

### 핵심 정리

- **클래스는 꼭 필요한 경우가 아니라면 불변이어야 한다.**<br>
불변 클래스는 장점이 많으며, 단점이라곤 특정 상황에서의 잠재적 성능 저하뿐이다.<br>

- 성능 때문에 어쩔 수 없다면 불변 클래스와 쌍을 이루는 가변 동반 클래스를 public 클래스로 제공하라.<br>

- 불변 클래스로 만들 수 없는 클래스라도 변경할 수 있는 부분을 최소한으로 줄이자.<br>
객체가 가질 수 있는 상태의 수를 줄이면 그 객체를 예측하기 쉬워지고 오류가 생길 가능성이 줄어든다.<br>
그러니 꼭 변경해야 할 필드를 제외한 나머지 모두를 final로 선언하자.<br>

- 다른 합당한 이유가 없다면 모든 필드는 private final이어야 한다.<br>

- 생성자는 불변식 설정이 모두 완료된, 초기화가 완벽히 끝난 상태의 객체를 생성해야 한다.<br>
확실한 이유가 없다면 생성자와 정적 팩터리 외에는 그 어떤 초기화 메서드도 public으로 제공해서는 안 된다.<br>

- 객체를 재활용할 목적으로 상태를 다시 초기화하는 메서드도 안 된다. 복잡성만 커지고 성능 이점은 거의 없다.
